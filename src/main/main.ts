import { app, BrowserWindow, ipcMain, session, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import os from 'os';
import { randomUUID } from 'crypto';
import { autoUpdater } from 'electron-updater';
import { getVersionManifest, downloadVersion, verifyAndRepairVersion, installFabric, getMinecraftDir } from './minecraft/MinecraftAPI';
import { launchMinecraft } from './minecraft/MinecraftLauncher';
import { authenticate, refresh, validate, invalidate } from './auth/ElyByAuth';
import { startOAuthFlow } from './auth/ElyByOAuth';

let mainWindow: BrowserWindow | null = null;

// Настройка авто-обновления
function setupAutoUpdater() {
  const isDev = !app.isPackaged;
  if (isDev) return; // В dev режиме не проверяем обновления

  autoUpdater.autoDownload = true;       // Скачивать автоматически
  autoUpdater.autoInstallOnAppQuit = true; // Устанавливать при закрытии

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:progress', {
      percent: Math.floor(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:error', err.message);
  });

  // Проверяем обновления через 3 секунды после запуска
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    minWidth: 800,
    minHeight: 500,
    title: 'Kaleka',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Убираем упоминания Electron из User-Agent
      spellcheck: false,
    },
    frame: false,
    backgroundColor: '#080808',
    show: false, // Не показываем окно сразу
  });

  // Показываем окно только когда оно готово
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Маскируем User-Agent
  mainWindow.webContents.setUserAgent('Kaleka/1.0.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');

  // DevTools только в режиме разработки
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  if (isDev) {
    // Явно грузим localhost
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('Failed to load URL:', err);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('did-fail-load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Устанавливаем имя приложения
  app.setName('Kaleka');
  app.setAppUserModelId('com.kaleka.launcher');
  
  // Разрешаем запросы к внешним API
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Маскируем User-Agent для всех запросов
    details.requestHeaders['User-Agent'] = 'Kaleka/1.0.0';
    callback({ requestHeaders: details.requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob: https://skinsystem.ely.by https://crafatar.com https://mc-heads.net; connect-src 'self' https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
        ],
      },
    });
  });

  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Авто-обновление
ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) return { checking: false };
  await autoUpdater.checkForUpdates().catch(() => {});
  return { checking: true };
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall();
});

// Minecraft API
ipcMain.handle('minecraft:get-versions', async () => {
  const manifest = await getVersionManifest();
  return manifest.versions.filter((v) => v.type === 'release').slice(0, 20);
});

ipcMain.handle('minecraft:download-version', async (event, versionId: string) => {
  await downloadVersion(versionId, (status, percent) => {
    event.sender.send('minecraft:download-progress', { versionId, status, percent });
  });
});

ipcMain.handle('minecraft:verify-version', async (event, versionId: string) => {
  await verifyAndRepairVersion(versionId, (status, percent) => {
    event.sender.send('minecraft:download-progress', { versionId, status, percent });
  });
});

ipcMain.handle('minecraft:launch', async (event, options: any) => {
  await launchMinecraft({
    ...options,
    onLog: (line: string) => {
      event.sender.send('minecraft:log', { line });
    },
  });
});

ipcMain.handle('minecraft:install-fabric', async (event, mcVersionId: string) => {
  const fabricVersionId = await installFabric(mcVersionId, (status, percent) => {
    event.sender.send('minecraft:download-progress', { versionId: mcVersionId, status, percent });
  });
  return fabricVersionId;
});

// Скачивание модов
ipcMain.handle('minecraft:download-mod', async (event, url: string, fileName: string) => {
  const minecraftDir = getMinecraftDir();
  const modsDir = path.join(minecraftDir, 'mods');

  // Создаём папку mods если её нет
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
  }

  const filePath = path.join(modsDir, fileName);

  return new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Редирект
        if (response.headers.location) {
          https.get(response.headers.location, (redirectResponse) => {
            const totalSize = parseInt(redirectResponse.headers['content-length'] || '0', 10);
            let downloadedSize = 0;

            redirectResponse.pipe(file);

            redirectResponse.on('data', (chunk) => {
              downloadedSize += chunk.length;
              const percent = totalSize > 0 ? Math.floor((downloadedSize / totalSize) * 100) : 0;
              event.sender.send('minecraft:mod-download-progress', { fileName, percent, downloadedSize, totalSize });
            });

            file.on('finish', () => {
              file.close();
              resolve();
            });

            redirectResponse.on('error', (err) => {
              fs.unlink(filePath, () => {});
              reject(err);
            });
          });
        }
      } else {
        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;

        response.pipe(file);

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const percent = totalSize > 0 ? Math.floor((downloadedSize / totalSize) * 100) : 0;
          event.sender.send('minecraft:mod-download-progress', { fileName, percent, downloadedSize, totalSize });
        });

        file.on('finish', () => {
          file.close();
          resolve();
        });

        response.on('error', (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      }
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
});

// Получить системную информацию
ipcMain.handle('system:get-total-memory', () => {
  // Возвращаем в мегабайтах
  const totalMemoryMB = Math.floor(os.totalmem() / 1024 / 1024);
  return totalMemoryMB;
});

// Открыть папку с ресурспаками
ipcMain.handle('system:open-resourcepacks-folder', () => {
  const minecraftDir = getMinecraftDir();
  const resourcepacksDir = path.join(minecraftDir, 'resourcepacks');
  
  // Создаём папку если её нет
  if (!fs.existsSync(resourcepacksDir)) {
    fs.mkdirSync(resourcepacksDir, { recursive: true });
  }
  
  // Открываем в проводнике
  shell.openPath(resourcepacksDir);
});

// Browse for java.exe
ipcMain.handle('system:browse-java-path', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Выберите java.exe',
    filters: [{ name: 'Java', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// List installed mods
ipcMain.handle('system:list-mods', () => {
  const minecraftDir = getMinecraftDir();
  const modsDir = path.join(minecraftDir, 'mods');
  if (!fs.existsSync(modsDir)) return [];
  return fs.readdirSync(modsDir);
});

import { detectLaunchers, getAvailableFolders, importData } from './minecraft/ImportData';

// Ely.by Authentication
ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
  try {
    const clientToken = randomUUID();
    const account = await authenticate(username, password, clientToken);
    return { success: true, account };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:oauth-login', async (_event) => {
  try {
    const account = await startOAuthFlow();
    return { success: true, account };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:refresh', async (_event, accessToken: string, clientToken: string) => {
  try {
    const account = await refresh(accessToken, clientToken);
    return { success: true, account };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:validate', async (_event, accessToken: string) => {
  const isValid = await validate(accessToken);
  return isValid;
});

ipcMain.handle('auth:logout', async (_event, accessToken: string, clientToken: string) => {
  try {
    await invalidate(accessToken, clientToken);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

import { getModsList, toggleMod, deleteMod } from './minecraft/ModManager';

// Import data from other launchers
ipcMain.handle('import:detect-launchers', () => {
  return detectLaunchers();
});

ipcMain.handle('import:get-folders', (_event, sourcePath: string) => {
  return getAvailableFolders(sourcePath);
});

ipcMain.handle('import:browse-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Выберите папку .minecraft',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('import:run', async (event, sourcePath: string, folders: string[], targetVersion?: string) => {
  const destPath = getMinecraftDir();
  try {
    const result = await importData({
      sourcePath,
      destPath,
      folders,
      targetVersion,
      onProgress: (status, percent) => {
        event.sender.send('import:progress', { status, percent });
      },
    });
    return { success: true, ...result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Mods management
ipcMain.handle('mods:get-list', async () => {
  const modsPath = path.join(getMinecraftDir(), 'mods');
  try {
    const mods = await getModsList(modsPath);
    return { success: true, mods };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:toggle', async (_event, modPath: string) => {
  try {
    const newState = toggleMod(modPath);
    return { success: true, enabled: newState };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:delete', async (_event, modPath: string) => {
  try {
    deleteMod(modPath);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

