import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import axios from 'axios';
import { getMinecraftDir, downloadFile, downloadVersion, installFabric } from './MinecraftAPI';

// ==========================================
// .kl — собственный формат модпаков Kaleka Launcher.
//
// Это обычный zip-архив (переименованный в .kl) со структурой:
//   manifest.json                — метаданные + список модов
//   overrides/config/**          — точная копия папки config
//   overrides/options.txt        — настройки игры (если есть)
//   overrides/mods/<file>.jar    — моды, которые НЕ удалось найти на Modrinth
//                                   (приватные/самописные/сборки) — зашиваются
//                                   в архив как есть
//
// Моды, которые нашлись на Modrinth по sha1-хэшу, в архив НЕ кладутся —
// в manifest.json просто сохраняется прямая ссылка на скачивание, и при
// импорте они докачиваются с CDN Modrinth. Это держит размер .kl маленьким.
// ==========================================

const FORMAT = 'kl-modpack';
const FORMAT_VERSION = 1;

export interface KlModEntry {
  fileName: string;
  name: string;
  sha1: string;
  size: number;
  downloadUrl?: string; // есть — скачать; нет — искать в overrides/mods/
  embedded: boolean;
}

export interface KlManifest {
  format: typeof FORMAT;
  formatVersion: number;
  name: string;
  author?: string;
  createdAt: string;
  mcVersion: string;
  modLoader: 'fabric';
  mods: KlModEntry[];
}

export interface KlExportOptions {
  mcVersion: string;
  name: string;
  author?: string;
  outPath: string; // путь для сохранения .kl файла
}

export interface KlImportResult {
  packName: string;
  mcVersion: string;
  modsInstalled: number;
  modsDownloaded: number;
  modsEmbedded: number;
}

function sha1File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function safeJoin(baseDir: string, relPath: string): string {
  // Защита от zip-slip: не даём entryName вида "../../whatever" вылезти за pack.
  const target = path.normalize(path.join(baseDir, relPath));
  if (!target.startsWith(path.normalize(baseDir))) {
    throw new Error(`Небезопасный путь в архиве: ${relPath}`);
  }
  return target;
}

/**
 * Пытается найти моды на Modrinth по их sha1-хэшам одним запросом.
 * Возвращает Map<sha1, {url, project}>.
 */
async function resolveViaModrinth(hashes: string[]): Promise<Map<string, { url: string; project?: string }>> {
  const result = new Map<string, { url: string; project?: string }>();
  if (hashes.length === 0) return result;

  try {
    const { data } = await axios.post(
      'https://api.modrinth.com/v2/version_files',
      { hashes, algorithm: 'sha1' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    for (const hash of Object.keys(data || {})) {
      const version = data[hash];
      const file = (version.files || []).find((f: any) => f.hashes?.sha1 === hash) || version.files?.[0];
      if (file?.url) {
        result.set(hash, { url: file.url, project: version.project_id });
      }
    }
  } catch {
    // Modrinth недоступен/лимит — просто ничего не резолвим, все моды уйдут embedded
  }

  return result;
}

/**
 * Экспортирует текущий набор модов + конфиги в .kl файл.
 */
export async function exportKlPack(
  options: KlExportOptions,
  onProgress: (status: string, percent: number) => void
): Promise<void> {
  const { mcVersion, name, author, outPath } = options;
  const minecraftDir = getMinecraftDir();
  const modsDir = path.join(minecraftDir, 'mods');
  const configDir = path.join(minecraftDir, 'config');
  const optionsFile = path.join(minecraftDir, 'options.txt');

  onProgress('Собираем список модов...', 5);

  const jarFiles = fs.existsSync(modsDir)
    ? fs.readdirSync(modsDir).filter((f) => f.endsWith('.jar')) // только включённые моды
    : [];

  const fileMeta = jarFiles.map((fileName) => {
    const filePath = path.join(modsDir, fileName);
    const stat = fs.statSync(filePath);
    return { fileName, filePath, sha1: sha1File(filePath), size: stat.size };
  });

  onProgress('Ищем моды на Modrinth...', 15);
  const resolved = await resolveViaModrinth(fileMeta.map((m) => m.sha1));

  const zip = new AdmZip();
  const mods: KlModEntry[] = [];
  let done = 0;

  for (const m of fileMeta) {
    const hit = resolved.get(m.sha1);
    if (hit) {
      mods.push({
        fileName: m.fileName,
        name: m.fileName.replace(/\.jar$/, ''),
        sha1: m.sha1,
        size: m.size,
        downloadUrl: hit.url,
        embedded: false,
      });
    } else {
      // Не нашли на Modrinth — зашиваем сам jar в архив
      zip.addLocalFile(m.filePath, 'overrides/mods');
      mods.push({
        fileName: m.fileName,
        name: m.fileName.replace(/\.jar$/, ''),
        sha1: m.sha1,
        size: m.size,
        embedded: true,
      });
    }
    done++;
    onProgress(`Обработано модов: ${done}/${fileMeta.length}`, 15 + Math.floor((done / Math.max(fileMeta.length, 1)) * 55));
  }

  onProgress('Копируем конфиги...', 75);
  if (fs.existsSync(configDir)) {
    zip.addLocalFolder(configDir, 'overrides/config');
  }
  if (fs.existsSync(optionsFile)) {
    zip.addLocalFile(optionsFile, 'overrides');
  }

  const manifest: KlManifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    name,
    author,
    createdAt: new Date().toISOString(),
    mcVersion,
    modLoader: 'fabric',
    mods,
  };

  onProgress('Упаковываем...', 90);
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  zip.writeZip(outPath);

  onProgress('Готово!', 100);
}

/**
 * Читает manifest.json из .kl файла без установки — для превью перед импортом.
 */
export function readKlManifest(klPath: string): KlManifest {
  const zip = new AdmZip(klPath);
  const entry = zip.getEntry('manifest.json');
  if (!entry) throw new Error('Это не .kl модпак: не найден manifest.json');
  const manifest = JSON.parse(entry.getData().toString('utf-8')) as KlManifest;
  if (manifest.format !== FORMAT) throw new Error('Неизвестный формат модпака');
  return manifest;
}

/**
 * Устанавливает модпак .kl: качает/устанавливает версию Minecraft + Fabric,
 * докачивает моды с Modrinth или достаёт зашитые из архива, раскладывает конфиги.
 * Полностью заменяет текущие mods/config на те, что в паке ("как у автора").
 */
export async function importKlPack(
  klPath: string,
  onProgress: (status: string, percent: number) => void
): Promise<KlImportResult> {
  const zip = new AdmZip(klPath);
  const manifest = readKlManifest(klPath);
  const minecraftDir = getMinecraftDir();
  const modsDir = path.join(minecraftDir, 'mods');
  const configDir = path.join(minecraftDir, 'config');

  onProgress(`Устанавливаем Minecraft ${manifest.mcVersion}...`, 0);
  await downloadVersion(manifest.mcVersion, (status, percent) => {
    onProgress(status, Math.floor(percent * 0.35));
  });

  onProgress('Устанавливаем Fabric...', 36);
  await installFabric(manifest.mcVersion, (status, percent) => {
    onProgress(status, 36 + Math.floor(percent * 0.09));
  });

  // Полная замена модов — очищаем папку
  onProgress('Очищаем старые моды...', 46);
  if (fs.existsSync(modsDir)) {
    for (const f of fs.readdirSync(modsDir)) {
      if (f.endsWith('.jar') || f.endsWith('.jar.disabled')) {
        try { fs.unlinkSync(path.join(modsDir, f)); } catch {}
      }
    }
  } else {
    fs.mkdirSync(modsDir, { recursive: true });
  }

  let downloaded = 0;
  let embedded = 0;
  let i = 0;

  for (const mod of manifest.mods) {
    const dest = path.join(modsDir, mod.fileName);
    if (mod.downloadUrl && !mod.embedded) {
      await downloadFile(mod.downloadUrl, dest);
      downloaded++;
    } else {
      const entry = zip.getEntry(`overrides/mods/${mod.fileName}`);
      if (entry) {
        fs.writeFileSync(dest, entry.getData());
        embedded++;
      }
    }
    i++;
    onProgress(`Устанавливаем моды: ${i}/${manifest.mods.length}`, 46 + Math.floor((i / Math.max(manifest.mods.length, 1)) * 44));
  }

  onProgress('Раскладываем конфиги...', 92);
  // config/
  if (fs.existsSync(configDir)) {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
  const configPrefix = 'overrides/config/';
  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith(configPrefix) && !entry.isDirectory) {
      const rel = entry.entryName.substring(configPrefix.length);
      const dest = safeJoin(configDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
    }
  }
  // options.txt
  const optionsEntry = zip.getEntry('overrides/options.txt');
  if (optionsEntry) {
    fs.writeFileSync(path.join(minecraftDir, 'options.txt'), optionsEntry.getData());
  }

  onProgress('Готово!', 100);

  return {
    packName: manifest.name,
    mcVersion: manifest.mcVersion,
    modsInstalled: manifest.mods.length,
    modsDownloaded: downloaded,
    modsEmbedded: embedded,
  };
}
