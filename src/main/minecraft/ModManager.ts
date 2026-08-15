import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface ModInfo {
  fileName: string;          // Имя файла (например "sodium-fabric-0.5.8.jar")
  name: string;              // Название мода
  version: string;           // Версия мода
  description?: string;      // Описание
  authors?: string[];        // Авторы
  mcVersion?: string;        // Совместимость с Minecraft
  modLoader?: 'fabric' | 'forge' | 'unknown'; // Тип загрузчика
  enabled: boolean;          // Включён ли мод
  filePath: string;          // Полный путь к файлу
  iconBase64?: string;       // Base64 иконки мода
}

/**
 * Получить список всех модов из папки mods
 */
export async function getModsList(modsPath: string): Promise<ModInfo[]> {
  if (!fs.existsSync(modsPath)) {
    return [];
  }

  const files = fs.readdirSync(modsPath);
  const mods: ModInfo[] = [];

  for (const file of files) {
    // Обрабатываем только .jar и .jar.disabled файлы
    if (!file.endsWith('.jar') && !file.endsWith('.jar.disabled')) {
      continue;
    }

    const filePath = path.join(modsPath, file);
    const isEnabled = file.endsWith('.jar');
    const actualFileName = isEnabled ? file : file.replace('.disabled', '');

    try {
      const modInfo = await parseModInfo(filePath, actualFileName, isEnabled);
      mods.push(modInfo);
    } catch (err) {
      // Если не удалось прочитать мод, добавляем базовую информацию
      mods.push({
        fileName: actualFileName,
        name: actualFileName.replace('.jar', ''),
        version: 'Unknown',
        enabled: isEnabled,
        filePath,
        modLoader: 'unknown',
      });
    }
  }

  // Сортируем по имени
  mods.sort((a, b) => a.name.localeCompare(b.name));

  return mods;
}

/**
 * Извлекает иконку мода из JAR файла и конвертирует в base64
 */
function extractModIcon(zip: AdmZip, iconPath?: string): string | undefined {
  try {
    const entries = zip.getEntries();
    
    // Если указан путь к иконке в метаданных
    if (iconPath) {
      const possiblePaths = [
        iconPath,
        iconPath.replace(/^\//, ''),
        `assets/${iconPath}`,
        `assets/${iconPath.replace(/^\//, '')}`,
      ];
      
      for (const testPath of possiblePaths) {
        const iconEntry = entries.find((e) => 
          e.entryName === testPath || 
          e.entryName.endsWith(`/${testPath}`)
        );
        if (iconEntry && !iconEntry.isDirectory) {
          const iconData = iconEntry.getData();
          console.log(`Icon found at: ${iconEntry.entryName}`);
          return iconData.toString('base64');
        }
      }
    }

    // Поиск стандартных иконок
    const standardPaths = ['icon.png', 'logo.png', 'pack.png'];
    
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      
      const entryName = entry.entryName.toLowerCase();
      
      // Проверяем стандартные имена в любой папке
      for (const standardPath of standardPaths) {
        if (entryName.endsWith(standardPath) || entryName === standardPath) {
          const iconData = entry.getData();
          console.log(`Icon found at: ${entry.entryName}`);
          return iconData.toString('base64');
        }
      }
    }
    
    console.log('No icon found in JAR');
  } catch (err) {
    console.error('Failed to extract mod icon:', err);
  }
  return undefined;
}

/**
 * Парсит информацию о моде из JAR файла
 */
async function parseModInfo(filePath: string, fileName: string, enabled: boolean): Promise<ModInfo> {
  console.log(`Parsing mod: ${fileName}`);
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  // Пробуем Fabric (fabric.mod.json)
  const fabricEntry = entries.find((e) => e.entryName === 'fabric.mod.json');
  if (fabricEntry) {
    const content = fabricEntry.getData().toString('utf8');
    const json = JSON.parse(content);
    console.log(`Fabric mod detected: ${json.name}, icon path: ${json.icon || 'not specified'}`);

    const iconBase64 = extractModIcon(zip, json.icon);

    return {
      fileName,
      name: json.name || fileName.replace('.jar', ''),
      version: json.version || 'Unknown',
      description: json.description,
      authors: json.authors ? (Array.isArray(json.authors) ? json.authors : [json.authors]) : undefined,
      mcVersion: json.depends?.minecraft,
      modLoader: 'fabric',
      enabled,
      filePath,
      iconBase64,
    };
  }

  // Пробуем Forge (META-INF/mods.toml)
  const tomlEntry = entries.find((e) => e.entryName === 'META-INF/mods.toml');
  if (tomlEntry) {
    const content = tomlEntry.getData().toString('utf8');
    
    // Простой парсинг TOML (только основные поля)
    const modIdMatch = content.match(/modId\s*=\s*"([^"]+)"/);
    const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
    const displayNameMatch = content.match(/displayName\s*=\s*"([^"]+)"/);
    const descriptionMatch = content.match(/description\s*=\s*'''([^']+)'''|description\s*=\s*"([^"]+)"/);
    const authorsMatch = content.match(/authors\s*=\s*"([^"]+)"/);
    const mcVersionMatch = content.match(/\[\[dependencies\.\w+\]\][\s\S]*?modId\s*=\s*"minecraft"[\s\S]*?versionRange\s*=\s*"([^"]+)"/);
    const logoFileMatch = content.match(/logoFile\s*=\s*"([^"]+)"/);

    const iconBase64 = extractModIcon(zip, logoFileMatch?.[1]);

    return {
      fileName,
      name: displayNameMatch?.[1] || modIdMatch?.[1] || fileName.replace('.jar', ''),
      version: versionMatch?.[1] || 'Unknown',
      description: descriptionMatch?.[1] || descriptionMatch?.[2],
      authors: authorsMatch?.[1] ? [authorsMatch[1]] : undefined,
      mcVersion: mcVersionMatch?.[1],
      modLoader: 'forge',
      enabled,
      filePath,
      iconBase64,
    };
  }

  // Старый формат Forge (mcmod.info)
  const mcmodEntry = entries.find((e) => e.entryName === 'mcmod.info');
  if (mcmodEntry) {
    const content = mcmodEntry.getData().toString('utf8');
    const json = JSON.parse(content);
    const modList = Array.isArray(json) ? json : [json];
    const mod = modList[0];

    const iconBase64 = extractModIcon(zip, mod.logoFile);

    return {
      fileName,
      name: mod.name || fileName.replace('.jar', ''),
      version: mod.version || 'Unknown',
      description: mod.description,
      authors: mod.authorList || (mod.authors ? [mod.authors] : undefined),
      mcVersion: mod.mcversion,
      modLoader: 'forge',
      enabled,
      filePath,
      iconBase64,
    };
  }

  // Если не удалось определить - возвращаем базовую информацию
  const iconBase64 = extractModIcon(zip);
  
  return {
    fileName,
    name: fileName.replace('.jar', ''),
    version: 'Unknown',
    enabled,
    filePath,
    modLoader: 'unknown',
    iconBase64,
  };
}

/**
 * Включить мод (убрать .disabled)
 */
export function enableMod(modPath: string): void {
  if (modPath.endsWith('.disabled')) {
    const newPath = modPath.replace('.disabled', '');
    fs.renameSync(modPath, newPath);
  }
}

/**
 * Отключить мод (добавить .disabled)
 */
export function disableMod(modPath: string): void {
  if (!modPath.endsWith('.disabled')) {
    const newPath = modPath + '.disabled';
    fs.renameSync(modPath, newPath);
  }
}

/**
 * Переключить состояние мода
 */
export function toggleMod(modPath: string): boolean {
  if (modPath.endsWith('.disabled')) {
    enableMod(modPath);
    return true; // теперь включён
  } else {
    disableMod(modPath);
    return false; // теперь отключён
  }
}

/**
 * Удалить мод
 */
export function deleteMod(modPath: string): void {
  if (fs.existsSync(modPath)) {
    fs.unlinkSync(modPath);
  }
}
