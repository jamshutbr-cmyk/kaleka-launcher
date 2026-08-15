import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';

const MINECRAFT_DIR = path.join(app.getPath('appData'), 'KalekaLauncher');
const VERSIONS_DIR = path.join(MINECRAFT_DIR, 'versions');
const LIBRARIES_DIR = path.join(MINECRAFT_DIR, 'libraries');
const ASSETS_DIR = path.join(MINECRAFT_DIR, 'assets');

export interface MinecraftVersion {
  id: string;
  type: string;
  url: string;
  releaseTime: string;
}

export interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MinecraftVersion[];
}

function httpsGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

export function downloadFile(url: string, dest: string, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}

    const file = fs.createWriteStream(dest);
    file.on('error', (err) => {
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
    https.get(url, (res) => {
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && total > 0) {
          onProgress(Math.floor((downloaded / total) * 100));
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

async function downloadConcurrent(
  tasks: (() => Promise<void>)[],
  concurrency: number,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  let done = 0;
  const total = tasks.length;
  const queue = [...tasks];

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      await task();
      done++;
      onProgress(done, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
}

export async function getVersionManifest(): Promise<VersionManifest> {
  return httpsGet('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
}

export async function getVersionInfo(versionId: string, versionUrl: string): Promise<any> {
  return httpsGet(versionUrl);
}

export async function downloadVersion(
  versionId: string,
  onProgress: (status: string, percent: number) => void
): Promise<void> {
  onProgress('Получение манифеста...', 0);
  const manifest = await getVersionManifest();
  const version = manifest.versions.find((v) => v.id === versionId);
  if (!version) throw new Error(`Версия ${versionId} не найдена`);

  onProgress('Загрузка конфигурации версии...', 5);
  const versionInfo = await getVersionInfo(versionId, version.url);

  const versionDir = path.join(VERSIONS_DIR, versionId);
  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
  }

  // Сохраняем JSON версии
  const versionJsonPath = path.join(versionDir, `${versionId}.json`);
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionInfo, null, 2));

  // Скачиваем клиент
  onProgress('Загрузка клиента...', 10);
  const clientJarPath = path.join(versionDir, `${versionId}.jar`);
  if (!fs.existsSync(clientJarPath)) {
    await downloadFile(versionInfo.downloads.client.url, clientJarPath, (p) => {
      onProgress('Загрузка клиента...', 10 + Math.floor(p * 0.4));
    });
  }

  // Скачиваем библиотеки
  onProgress('Загрузка библиотек...', 50);
  const libraries = versionInfo.libraries || [];
  let libIndex = 0;
  for (const lib of libraries) {
    if (lib.downloads?.artifact) {
      const libPath = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
      if (!fs.existsSync(libPath)) {
        await downloadFile(lib.downloads.artifact.url, libPath);
      }
    }
    libIndex++;
    onProgress('Загрузка библиотек...', 50 + Math.floor((libIndex / libraries.length) * 30));
  }

  // Скачиваем ассеты
  onProgress('Загрузка ассетов...', 80);
  const assetIndexUrl = versionInfo.assetIndex.url;
  const assetIndex = await httpsGet(assetIndexUrl);
  const assetsIndexDir = path.join(ASSETS_DIR, 'indexes');
  if (!fs.existsSync(assetsIndexDir)) {
    fs.mkdirSync(assetsIndexDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(assetsIndexDir, `${versionInfo.assetIndex.id}.json`),
    JSON.stringify(assetIndex, null, 2)
  );

  // Скачиваем объекты ассетов параллельно
  const objects = Object.values(assetIndex.objects) as Array<{ hash: string; size: number }>;
  const objectsDir = path.join(ASSETS_DIR, 'objects');

  const assetTasks = objects.map((obj) => async () => {
    const subDir = obj.hash.substring(0, 2);
    const objPath = path.join(objectsDir, subDir, obj.hash);
    if (!fs.existsSync(objPath)) {
      const url = `https://resources.download.minecraft.net/${subDir}/${obj.hash}`;
      await downloadFile(url, objPath);
    }
  });

  await downloadConcurrent(assetTasks, 16, (done, total) => {
    onProgress('Загрузка ассетов...', 80 + Math.floor((done / total) * 19));
  });

  onProgress('Готово!', 100);
}

export function getMinecraftDir(): string {
  return MINECRAFT_DIR;
}

export function getVersionsDir(): string {
  return VERSIONS_DIR;
}

export function getLibrariesDir(): string {
  return LIBRARIES_DIR;
}

/**
 * Verify integrity of all version files and re-download anything missing or corrupted.
 * Checks: client jar, libraries (by existence), asset objects (by SHA1 hash).
 */
export async function verifyAndRepairVersion(
  versionId: string,
  onProgress: (status: string, percent: number) => void
): Promise<void> {
  onProgress('Проверка файлов...', 0);

  const manifest = await getVersionManifest();
  const version = manifest.versions.find((v) => v.id === versionId);
  if (!version) throw new Error(`Версия ${versionId} не найдена`);

  const versionInfo = await getVersionInfo(versionId, version.url);

  // Helper: compute SHA1 of a file
  function fileSha1(filePath: string): string {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(buf).digest('hex');
  }

  let repaired = 0;

  // 1. Check client jar
  onProgress('Проверка клиента...', 5);
  const versionDir = path.join(VERSIONS_DIR, versionId);
  if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

  const clientJarPath = path.join(versionDir, `${versionId}.jar`);
  const expectedClientSha1 = versionInfo.downloads?.client?.sha1 as string | undefined;
  const clientBad =
    !fs.existsSync(clientJarPath) ||
    (expectedClientSha1 && fileSha1(clientJarPath) !== expectedClientSha1);
  if (clientBad) {
    repaired++;
    if (fs.existsSync(clientJarPath)) fs.unlinkSync(clientJarPath);
    await downloadFile(versionInfo.downloads.client.url, clientJarPath, (p) => {
      onProgress('Восстановление клиента...', 5 + Math.floor(p * 0.15));
    });
  }

  // 2. Check libraries
  onProgress('Проверка библиотек...', 20);
  const libraries = versionInfo.libraries || [];
  let libIndex = 0;
  for (const lib of libraries) {
    if (lib.downloads?.artifact) {
      const libPath = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
      const expectedSha1 = lib.downloads.artifact.sha1 as string | undefined;
      const libBad =
        !fs.existsSync(libPath) ||
        (expectedSha1 && fileSha1(libPath) !== expectedSha1);
      if (libBad) {
        repaired++;
        if (fs.existsSync(libPath)) fs.unlinkSync(libPath);
        await downloadFile(lib.downloads.artifact.url, libPath);
      }
    }
    libIndex++;
    onProgress('Проверка библиотек...', 20 + Math.floor((libIndex / libraries.length) * 30));
  }

  // 3. Check asset objects
  onProgress('Проверка ассетов...', 50);
  const assetIndexPath = path.join(ASSETS_DIR, 'indexes', `${versionInfo.assetIndex.id}.json`);
  let assetIndex: any;
  if (!fs.existsSync(assetIndexPath)) {
    assetIndex = await httpsGet(versionInfo.assetIndex.url);
    const assetsIndexDir = path.join(ASSETS_DIR, 'indexes');
    if (!fs.existsSync(assetsIndexDir)) fs.mkdirSync(assetsIndexDir, { recursive: true });
    fs.writeFileSync(assetIndexPath, JSON.stringify(assetIndex, null, 2));
  } else {
    assetIndex = JSON.parse(fs.readFileSync(assetIndexPath, 'utf-8'));
  }

  const objects = Object.values(assetIndex.objects) as Array<{ hash: string; size: number }>;
  const objectsDir = path.join(ASSETS_DIR, 'objects');
  let repairedAssets = 0;

  const verifyTasks = objects.map((obj) => async () => {
    const subDir = obj.hash.substring(0, 2);
    const objPath = path.join(objectsDir, subDir, obj.hash);
    const objBad =
      !fs.existsSync(objPath) ||
      fileSha1(objPath) !== obj.hash;
    if (objBad) {
      repairedAssets++;
      repaired++;
      if (fs.existsSync(objPath)) fs.unlinkSync(objPath);
      const url = `https://resources.download.minecraft.net/${subDir}/${obj.hash}`;
      await downloadFile(url, objPath);
    }
  });

  await downloadConcurrent(verifyTasks, 16, (done, total) => {
    onProgress('Проверка ассетов...', 50 + Math.floor((done / total) * 49));
  });

  onProgress(
    repaired > 0 ? `Восстановлено файлов: ${repaired}` : 'Все файлы в порядке',
    100
  );
}

export async function installFabric(
  mcVersionId: string,
  onProgress: (status: string, percent: number) => void
): Promise<string> {
  onProgress('Получение версий Fabric...', 0);

  // Get latest stable loader version
  const loaderVersions = await httpsGet(`https://meta.fabricmc.net/v2/versions/loader/${mcVersionId}`);
  const stableLoader = loaderVersions.find((v: any) => v.loader.stable === true);
  if (!stableLoader) throw new Error(`Fabric loader not found for ${mcVersionId}`);

  const loaderVersion = stableLoader.loader.version;
  onProgress(`Загрузка Fabric ${loaderVersion}...`, 10);

  // Get Fabric profile JSON
  const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersionId}/${loaderVersion}/profile/json`;
  const profile = await httpsGet(profileUrl);

  const fabricVersionId: string = profile.id; // e.g. "fabric-loader-0.16.10-1.21.1"

  // Save profile JSON
  const fabricVersionDir = path.join(VERSIONS_DIR, fabricVersionId);
  if (!fs.existsSync(fabricVersionDir)) {
    fs.mkdirSync(fabricVersionDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(fabricVersionDir, `${fabricVersionId}.json`),
    JSON.stringify(profile, null, 2)
  );

  // Download Fabric libraries
  const libraries = profile.libraries || [];
  let libIndex = 0;
  for (const lib of libraries) {
    const parts = lib.name.split(':');
    if (parts.length < 3) { libIndex++; continue; }
    const [group, artifact, version] = parts;
    const groupPath = group.replace(/\./g, '/');
    const jarName = `${artifact}-${version}.jar`;
    const mavenPath = `${groupPath}/${artifact}/${version}/${jarName}`;
    const libPath = path.join(LIBRARIES_DIR, mavenPath);

    if (!fs.existsSync(libPath)) {
      const baseUrl = lib.url || 'https://maven.fabricmc.net/';
      const downloadUrl = baseUrl.endsWith('/') ? baseUrl + mavenPath : baseUrl + '/' + mavenPath;
      await downloadFile(downloadUrl, libPath);
    }
    libIndex++;
    onProgress('Загрузка библиотек Fabric...', 10 + Math.floor((libIndex / libraries.length) * 89));
  }

  onProgress('Fabric установлен!', 100);
  return fabricVersionId;
}
