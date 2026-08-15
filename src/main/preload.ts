import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Minecraft API
  getMinecraftVersions: () => ipcRenderer.invoke('minecraft:get-versions'),
  downloadVersion: (versionId: string) => ipcRenderer.invoke('minecraft:download-version', versionId),
  verifyVersion: (versionId: string) => ipcRenderer.invoke('minecraft:verify-version', versionId),
  launchGame: (options: any) => ipcRenderer.invoke('minecraft:launch', options),
  installFabric: (mcVersionId: string) => ipcRenderer.invoke('minecraft:install-fabric', mcVersionId),
  
  // Mod download API
  downloadMod: (url: string, fileName: string) => ipcRenderer.invoke('minecraft:download-mod', url, fileName),
  
  // System API
  getTotalMemory: () => ipcRenderer.invoke('system:get-total-memory'),
  openResourcepacksFolder: () => ipcRenderer.invoke('system:open-resourcepacks-folder'),
  listMods: () => ipcRenderer.invoke('system:list-mods'),
  browseJavaPath: () => ipcRenderer.invoke('system:browse-java-path'),
  
  // Download progress listeners
  onDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('minecraft:download-progress', (_event, data) => callback(data));
  },
  
  onModDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('minecraft:mod-download-progress', (_event, data) => callback(data));
  },

  onGameLog: (callback: (data: { line: string }) => void) => {
    ipcRenderer.on('minecraft:log', (_event, data) => callback(data));
  },

  // Ely.by Auth API
  elyLogin: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
  elyOAuthLogin: () => ipcRenderer.invoke('auth:oauth-login'),
  elyRefresh: (accessToken: string, clientToken: string) => ipcRenderer.invoke('auth:refresh', accessToken, clientToken),
  elyValidate: (accessToken: string) => ipcRenderer.invoke('auth:validate', accessToken),
  elyLogout: (accessToken: string, clientToken: string) => ipcRenderer.invoke('auth:logout', accessToken, clientToken),

  // Import API
  importDetectLaunchers: () => ipcRenderer.invoke('import:detect-launchers'),
  importGetFolders: (sourcePath: string) => ipcRenderer.invoke('import:get-folders', sourcePath),
  importBrowseFolder: () => ipcRenderer.invoke('import:browse-folder'),
  importRun: (sourcePath: string, folders: string[], targetVersion?: string) => ipcRenderer.invoke('import:run', sourcePath, folders, targetVersion),
  onImportProgress: (callback: (data: { status: string; percent: number }) => void) => {
    ipcRenderer.on('import:progress', (_event, data) => callback(data));
  },

  // Mods API
  modsGetList: () => ipcRenderer.invoke('mods:get-list'),
  modsToggle: (modPath: string) => ipcRenderer.invoke('mods:toggle', modPath),
  modsDelete: (modPath: string) => ipcRenderer.invoke('mods:delete', modPath),

  // Auto-updater
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdaterChecking: (cb: () => void) => ipcRenderer.on('updater:checking', cb),
  onUpdaterAvailable: (cb: (info: { version: string }) => void) => ipcRenderer.on('updater:available', (_e, info) => cb(info)),
  onUpdaterNotAvailable: (cb: () => void) => ipcRenderer.on('updater:not-available', cb),
  onUpdaterProgress: (cb: (p: { percent: number }) => void) => ipcRenderer.on('updater:progress', (_e, p) => cb(p)),
  onUpdaterDownloaded: (cb: (info: { version: string }) => void) => ipcRenderer.on('updater:downloaded', (_e, info) => cb(info)),
  onUpdaterError: (cb: (msg: string) => void) => ipcRenderer.on('updater:error', (_e, msg) => cb(msg)),
});
