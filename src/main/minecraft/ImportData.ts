import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';

export interface LauncherInstall {
  name: string;      // Название лаунчера
  path: string;      // Путь к папке .minecraft
  folders: string[]; // Какие папки существуют (mods, saves, etc.)
}

export interface ImportOptions {
  sourcePath: string;
  destPath: string;
  folders: string[]; // что копировать: ['mods', 'saves', 'resourcepacks', ...]
  targetVersion?: string; // Целевая версия Minecraft для фильтрации модов
  onProgress: (status: string, percent: number) => void;
}

const KNOWN_LAUNCHERS: { name: string; paths: string[] }[] = [
  {
    name: 'Официальный / Legacy Launcher',
    paths: [
      path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft'),
    ],
  },
  {
    name: 'TLauncher',
    paths: [
      path.join(os.homedir(), 'AppData', 'Roaming', '.tlauncher', 'legacy', 'Minecraft', 'games', 'minecraft'),
      path.join(os.homedir(), 'AppData', 'Roaming', '.tlauncher', 'minecraft'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'tlauncher-legacy-java', 'legacy', 'Minecraft', 'games', 'minecraft'),
    ],
  },
  {
    name: 'PolyMC / Prism Launcher',
    paths: [
      path.join(os.homedir(), 'AppData', 'Roaming', 'PolyMC', 'instances'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'PrismLauncher', 'instances'),
    ],
  },
  {
    name: 'MultiMC',
    paths: [
      path.join(os.homedir(), 'AppData', 'Roaming', 'MultiMC', 'instances'),
    ],
  },
];

const IMPORT_FOLDERS = ['mods', 'saves', 'resourcepacks', 'shaderpacks', 'config', 'screenshots', 'texturepacks'];

/**
 * Автоматически находит все установленные лаунчеры
 */
export function detectLaunchers(): LauncherInstall[] {
  const found: LauncherInstall[] = [];

  for (const launcher of KNOWN_LAUNCHERS) {
    for (const launcherPath of launcher.paths) {
      if (!fs.existsSync(launcherPath)) continue;

      // Проверяем есть ли хоть что-то для импорта
      const existingFolders = IMPORT_FOLDERS.filter((folder) =>
        fs.existsSync(path.join(launcherPath, folder))
      );

      if (existingFolders.length > 0) {
        found.push({
          name: launcher.name,
          path: launcherPath,
          folders: existingFolders,
        });
        break; // берём первый найденный путь для этого лаунчера
      }
    }
  }

  return found;
}

/**
 * Получить список папок для импорта из указанного пути
 */
export function getAvailableFolders(sourcePath: string): string[] {
  if (!fs.existsSync(sourcePath)) return [];
  return IMPORT_FOLDERS.filter((folder) =>
    fs.existsSync(path.join(sourcePath, folder))
  );
}

/**
 * Проверяет совместимость мода с целевой версией Minecraft
 */
function isModCompatible(modPath: string, targetVersion: string): boolean {
  try {
    const zip = new AdmZip(modPath);
    const entries = zip.getEntries();

    // Проверяем Fabric mod (fabric.mod.json)
    const fabricEntry = entries.find((e) => e.entryName === 'fabric.mod.json');
    if (fabricEntry) {
      const content = fabricEntry.getData().toString('utf8');
      const json = JSON.parse(content);
      
      // Получаем зависимости от minecraft
      const mcDep = json.depends?.minecraft;
      if (mcDep) {
        return isVersionMatch(mcDep, targetVersion);
      }
    }

    // Проверяем Forge mod (META-INF/mods.toml или mcmod.info)
    const tomlEntry = entries.find((e) => e.entryName === 'META-INF/mods.toml');
    if (tomlEntry) {
      const content = tomlEntry.getData().toString('utf8');
      // Простой парсинг TOML для loaderVersion или minecraft version range
      const versionMatch = content.match(/loaderVersion\s*=\s*"([^"]+)"/);
      const mcVersionMatch = content.match(/\[\[dependencies\.\w+\]\][\s\S]*?modId\s*=\s*"minecraft"[\s\S]*?versionRange\s*=\s*"([^"]+)"/);
      
      if (mcVersionMatch && mcVersionMatch[1]) {
        return isVersionMatch(mcVersionMatch[1], targetVersion);
      }
    }

    // Старый формат Forge (mcmod.info)
    const mcmodEntry = entries.find((e) => e.entryName === 'mcmod.info');
    if (mcmodEntry) {
      const content = mcmodEntry.getData().toString('utf8');
      const json = JSON.parse(content);
      const modList = Array.isArray(json) ? json : [json];
      
      for (const mod of modList) {
        if (mod.mcversion) {
          return isVersionMatch(mod.mcversion, targetVersion);
        }
      }
    }

    // Если не удалось определить версию — копируем (на усмотрение пользователя)
    return true;
  } catch (err) {
    // Если не удалось прочитать мод — копируем
    return true;
  }
}

/**
 * Проверяет соответствие версии по паттерну
 * Поддерживает: "1.21.11", ">=1.21", "[1.21,)", "1.16.x", "*"
 */
function isVersionMatch(pattern: string, version: string): boolean {
  // Убираем пробелы
  pattern = pattern.trim();
  version = version.trim();

  // Wildcard
  if (pattern === '*') return true;

  // Точное совпадение
  if (pattern === version) return true;

  // Диапазон [min,max) или [min,]
  const rangeMatch = pattern.match(/\[([^,\]]+)(?:,([^\]]*))?\]/);
  if (rangeMatch) {
    const min = rangeMatch[1].trim();
    const max = rangeMatch[2]?.trim();
    
    if (compareVersions(version, min) >= 0) {
      if (!max || max === '') return true;
      return compareVersions(version, max) < 0;
    }
    return false;
  }

  // >= <= > <
  if (pattern.startsWith('>=')) {
    return compareVersions(version, pattern.substring(2).trim()) >= 0;
  }
  if (pattern.startsWith('<=')) {
    return compareVersions(version, pattern.substring(2).trim()) <= 0;
  }
  if (pattern.startsWith('>')) {
    return compareVersions(version, pattern.substring(1).trim()) > 0;
  }
  if (pattern.startsWith('<')) {
    return compareVersions(version, pattern.substring(1).trim()) < 0;
  }

  // Wildcard версия типа "1.21.x" или "1.16.*"
  if (pattern.includes('x') || pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/[x*]/g, '\\d+') + '$');
    return regex.test(version);
  }

  // Частичное совпадение (1.21 подходит для 1.21.11)
  if (version.startsWith(pattern + '.')) return true;

  return false;
}

/**
 * Сравнивает две версии (-1: a < b, 0: a == b, 1: a > b)
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  const maxLen = Math.max(partsA.length, partsB.length);
  
  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  
  return 0;
}

/**
 * Копирует папку рекурсивно, возвращает количество скопированных файлов
 */
/**
 * Копирует папку рекурсивно, возвращает количество скопированных файлов
 * Если указана targetVersion и это папка mods — фильтрует по совместимости
 */
function copyDirRecursive(src: string, dest: string, targetVersion?: string, folderName?: string): number {
  if (!fs.existsSync(src)) return 0;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath, targetVersion, folderName);
    } else {
      // Если это папка mods и указана версия — фильтруем
      if (folderName === 'mods' && targetVersion && entry.name.endsWith('.jar')) {
        if (!isModCompatible(srcPath, targetVersion)) {
          continue; // Пропускаем несовместимый мод
        }
      }
      
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }

  return count;
}

/**
 * Считает общее количество файлов в папках для импорта
 */
function countFiles(sourcePath: string, folders: string[]): number {
  let total = 0;
  for (const folder of folders) {
    const folderPath = path.join(sourcePath, folder);
    if (!fs.existsSync(folderPath)) continue;
    total += countFilesRecursive(folderPath);
  }
  return total;
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countFilesRecursive(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
  } catch {}
  return count;
}

/**
 * Выполняет импорт данных
 */
export async function importData(options: ImportOptions): Promise<{ imported: number; skipped: number }> {
  const { sourcePath, destPath, folders, targetVersion, onProgress } = options;

  onProgress('Подсчёт файлов...', 0);

  const total = countFiles(sourcePath, folders);
  if (total === 0) {
    onProgress('Нечего импортировать', 100);
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const src = path.join(sourcePath, folder);
    const dest = path.join(destPath, folder);

    if (!fs.existsSync(src)) {
      skipped++;
      continue;
    }

    const statusText = targetVersion && folder === 'mods' 
      ? `Копирование модов для ${targetVersion}...`
      : `Копирование ${folder}...`;
    
    onProgress(statusText, Math.floor((i / folders.length) * 90));

    try {
      imported += copyDirRecursive(src, dest, targetVersion, folder);
    } catch (err) {
      console.error(`Failed to copy ${folder}:`, err);
      skipped++;
    }
  }

  onProgress(`Готово! Скопировано файлов: ${imported}`, 100);
  return { imported, skipped };
}
