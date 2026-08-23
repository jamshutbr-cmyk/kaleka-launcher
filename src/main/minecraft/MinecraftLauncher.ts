import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getMinecraftDir, getVersionsDir, getLibrariesDir } from './MinecraftAPI';

interface LaunchOptions {
  versionId: string;
  username: string;
  javaPath?: string;
  maxMemory?: number;
  fabricVersionId?: string;
  onLog?: (line: string) => void;
  uuid?: string;
  accessToken?: string;
}

interface JavaInstallation {
  path: string;
  version: number;
}

function findAllJavaInstallations(): JavaInstallation[] {
  const installations: JavaInstallation[] = [];
  
  // Типичные пути установки Java на Windows
  const searchPaths = [
    'C:\\Program Files\\Java',
    'C:\\Program Files (x86)\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Eclipse Foundation',
    'C:\\Program Files\\AdoptOpenJDK',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\Amazon Corretto',
    'C:\\Program Files\\Microsoft',
    path.join(os.homedir(), '.jdks'),
    path.join(os.homedir(), 'scoop', 'apps'),
  ];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    try {
      const dirs = fs.readdirSync(searchPath);
      for (const dir of dirs) {
        // Используем java.exe для проверки версии (он всегда есть)
        const javaExePath = path.join(searchPath, dir, 'bin', 'java.exe');
        
        if (fs.existsSync(javaExePath)) {
          try {
            const versionOutput = execSync(`"${javaExePath}" -version 2>&1`, {
              encoding: 'utf-8',
              timeout: 3000,
            });
            
            // Парсим версию: "version \"21.0.1\"" или "version \"1.8.0\"" -> 21 или 8
            const match = versionOutput.match(/version "(\d+)\.(\d+)/);
            if (match) {
              // Если первое число 1, то используем второе (Java 8 = "1.8")
              const majorVersion = match[1] === '1' ? parseInt(match[2], 10) : parseInt(match[1], 10);
              installations.push({ path: javaExePath, version: majorVersion });
              console.log(`Found Java ${majorVersion} at ${javaExePath}`);
            }
          } catch {
            // Игнорируем если не смогли запустить java -version
          }
        }
      }
    } catch {
      // Игнорируем если не смогли прочитать директорию
    }
  }

  // Проверяем PATH
  try {
    const pathJava = execSync('where java', { encoding: 'utf-8', timeout: 3000 }).trim().split('\n')[0];
    if (pathJava && fs.existsSync(pathJava)) {
      try {
        const versionOutput = execSync(`"${pathJava}" -version 2>&1`, {
          encoding: 'utf-8',
          timeout: 3000,
        });
        const match = versionOutput.match(/version "(\d+)\.(\d+)/);
        if (match) {
          // Если первое число 1, то используем второе (Java 8 = "1.8")
          const majorVersion = match[1] === '1' ? parseInt(match[2], 10) : parseInt(match[1], 10);
          // Проверяем что этой установки ещё нет в списке
          if (!installations.find(i => i.path === pathJava)) {
            installations.push({ path: pathJava, version: majorVersion });
            console.log(`Found Java ${majorVersion} in PATH at ${pathJava}`);
          }
        }
      } catch {}
    }
  } catch {}

  return installations;
}

function findBestJava(requiredVersion: number = 17): string {
  const installations = findAllJavaInstallations();
  
  if (installations.length === 0) {
    throw new Error('Java не найдена. Установите Java 17 или выше.');
  }

  // Ищем подходящую версию (>= требуемой)
  const suitable = installations
    .filter(i => i.version >= requiredVersion)
    .sort((a, b) => a.version - b.version); // Сортируем по возрастанию

  if (suitable.length > 0) {
    console.log(`Using Java ${suitable[0].version} from ${suitable[0].path}`);
    return suitable[0].path;
  }

  // Если не нашли подходящую, берём самую новую
  const newest = installations.sort((a, b) => b.version - a.version)[0];
  console.warn(`Java ${requiredVersion}+ not found, using Java ${newest.version} (may not work)`);
  return newest.path;
}

export async function launchMinecraft(options: LaunchOptions): Promise<void> {
  const { versionId, username, maxMemory = 2048, fabricVersionId } = options;

  const minecraftDir = getMinecraftDir();
  const versionsDir = getVersionsDir();
  const librariesDir = getLibrariesDir();

  const versionDir = path.join(versionsDir, versionId);
  const versionJsonPath = path.join(versionDir, `${versionId}.json`);
  const clientJarPath = path.join(versionDir, `${versionId}.jar`);

  if (!fs.existsSync(versionJsonPath)) {
    throw new Error(`Версия ${versionId} не установлена`);
  }

  const versionInfo = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));

  // Определяем требуемую версию Java
  let requiredJavaVersion = 17; // По умолчанию
  if (versionInfo.javaVersion?.majorVersion) {
    requiredJavaVersion = versionInfo.javaVersion.majorVersion;
  }

  console.log(`Minecraft ${versionId} requires Java ${requiredJavaVersion}`);

  // Ищем подходящую Java
  const javaPath = options.javaPath || findBestJava(requiredJavaVersion);

  // Собираем classpath
  const classpathParts: string[] = [];

  // If Fabric is requested, prepend Fabric libraries first
  if (fabricVersionId) {
    const fabricJsonPath = path.join(versionsDir, fabricVersionId, `${fabricVersionId}.json`);
    if (!fs.existsSync(fabricJsonPath)) {
      throw new Error(`Fabric версия ${fabricVersionId} не установлена`);
    }
    const fabricProfile = JSON.parse(fs.readFileSync(fabricJsonPath, 'utf-8'));
    const fabricLibraries = fabricProfile.libraries || [];

    for (const lib of fabricLibraries) {
      const parts = lib.name.split(':');
      if (parts.length < 3) continue;
      const [group, artifact, version] = parts;
      const groupPath = group.replace(/\./g, '/');
      const jarName = `${artifact}-${version}.jar`;
      const mavenPath = `${groupPath}/${artifact}/${version}/${jarName}`;
      const libPath = path.join(librariesDir, mavenPath);
      if (fs.existsSync(libPath)) {
        classpathParts.push(libPath);
      }
    }
  }

  // Vanilla libraries
  const libraries = versionInfo.libraries || [];
  for (const lib of libraries) {
    if (lib.downloads?.artifact) {
      const libPath = path.join(librariesDir, lib.downloads.artifact.path);
      if (fs.existsSync(libPath) && !classpathParts.includes(libPath)) {
        classpathParts.push(libPath);
      }
    }
  }
  classpathParts.push(clientJarPath);

  const classpath = classpathParts.join(';');

  // Аргументы JVM
  const jvmArgs = [
    `-Xmx${maxMemory}M`,
    `-Xms${Math.floor(maxMemory / 2)}M`,
    `-Djava.library.path=${path.join(minecraftDir, 'natives')}`,
    `-cp`,
    classpath,
  ];

  // Главный класс: use Fabric's mainClass if available
  let mainClass = versionInfo.mainClass;
  if (fabricVersionId) {
    const fabricJsonPath = path.join(versionsDir, fabricVersionId, `${fabricVersionId}.json`);
    const fabricProfile = JSON.parse(fs.readFileSync(fabricJsonPath, 'utf-8'));
    if (fabricProfile.mainClass) {
      mainClass = fabricProfile.mainClass;
    }
  }

  // Аргументы игры
  const gameArgs = [
    '--username',
    username,
    '--version',
    versionId,
    '--gameDir',
    minecraftDir,
    '--assetsDir',
    path.join(minecraftDir, 'assets'),
    '--assetIndex',
    versionInfo.assetIndex.id,
    '--uuid',
    options.uuid || '00000000-0000-0000-0000-000000000000',
    '--accessToken',
    options.accessToken || 'null',
    '--userType',
    options.accessToken ? 'mojang' : 'offline',
    '--versionType',
    versionInfo.type,
  ];

  const args = [...jvmArgs, mainClass, ...gameArgs];

  console.log('Launching Minecraft:', javaPath, args);

  // Write logs to file
  const logsDir = path.join(minecraftDir, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, 'launcher-latest.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'w' });

  // Use javaw.exe instead of java.exe on Windows to suppress the console window.
  // javaw.exe is always in the same bin/ folder as java.exe.
  const effectiveJavaPath =
    process.platform === 'win32'
      ? javaPath.replace(/java\.exe$/i, 'javaw.exe')
      : javaPath;

  const minecraftProcess = spawn(effectiveJavaPath, args, {
    cwd: minecraftDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  minecraftProcess.stdout?.pipe(logStream);
  minecraftProcess.stderr?.pipe(logStream);

  minecraftProcess.stdout?.on('data', (data: Buffer) => {
    options.onLog?.(data.toString());
  });

  minecraftProcess.stderr?.on('data', (data: Buffer) => {
    options.onLog?.(data.toString());
  });

  minecraftProcess.on('error', (err) => {
    console.error('Failed to start Minecraft:', err);
    logStream.write(`[ERROR] ${err.message}\n`);
  });

  minecraftProcess.on('close', (code) => {
    logStream.end();
    console.log(`Minecraft exited with code ${code}`);
  });

  minecraftProcess.unref();
}
