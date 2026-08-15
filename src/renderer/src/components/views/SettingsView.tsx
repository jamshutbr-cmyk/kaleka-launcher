import React, { useState, useEffect } from 'react';
import './SettingsView.css';

interface ElyAccount {
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}

interface SettingsViewProps {
  elyAccount: ElyAccount | null;
  onElyAccountChange: (account: ElyAccount | null) => void;
}

interface LauncherInstall {
  name: string;
  path: string;
  folders: string[];
}

const FOLDER_LABELS: Record<string, string> = {
  mods: 'Моды',
  saves: 'Миры',
  resourcepacks: 'Ресурспаки',
  shaderpacks: 'Шейдеры',
  config: 'Конфиги',
  screenshots: 'Скриншоты',
  texturepacks: 'Текстуры',
};

declare global {
  interface Window {
    electronAPI?: {
      getTotalMemory: () => Promise<number>;
      openResourcepacksFolder: () => Promise<void>;
      browseJavaPath: () => Promise<string | null>;
      elyOAuthLogin: () => Promise<any>;
      elyLogout: (accessToken: string, clientToken: string) => Promise<any>;
      importDetectLaunchers: () => Promise<LauncherInstall[]>;
      importGetFolders: (sourcePath: string) => Promise<string[]>;
      importBrowseFolder: () => Promise<string | null>;
      importRun: (sourcePath: string, folders: string[], targetVersion?: string) => Promise<any>;
      onImportProgress: (callback: (data: { status: string; percent: number }) => void) => void;
      getAppVersion: () => Promise<string>;
      updaterCheck: () => Promise<{ checking: boolean }>;
      onUpdaterChecking: (cb: () => void) => void;
      onUpdaterAvailable: (cb: (info: { version: string }) => void) => void;
      onUpdaterNotAvailable: (cb: () => void) => void;
      onUpdaterError: (cb: (msg: string) => void) => void;
    };
  }
}

function SettingsView({ elyAccount, onElyAccountChange }: SettingsViewProps) {
  const [ram, setRam] = useState(4096);
  const [maxRam, setMaxRam] = useState(16384);
  const [javaPath, setJavaPath] = useState('');
  const [elyLoading, setElyLoading] = useState(false);
  const [elyError, setElyError] = useState('');

  // Обновления
  const [appVersion, setAppVersion] = useState('');
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState('');

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [launchers, setLaunchers] = useState<LauncherInstall[]>([]);
  const [selectedSource, setSelectedSource] = useState<LauncherInstall | null>(null);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('1.21.11'); // Версия для фильтрации модов
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [importDone, setImportDone] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getTotalMemory) {
      window.electronAPI.getTotalMemory().then((totalMemory) => {
        setMaxRam(totalMemory);
        if (ram > totalMemory) setRam(Math.min(totalMemory, 4096));
      });
    }
    const saved = localStorage.getItem('javaPath');
    if (saved) setJavaPath(saved);
    const savedRam = localStorage.getItem('ram');
    if (savedRam) setRam(Number(savedRam));

    window.electronAPI?.onImportProgress?.((data) => {
      setImportProgress(data.percent);
      setImportStatus(data.status);
    });

    window.electronAPI?.getAppVersion?.().then((v) => setAppVersion(v));
    window.electronAPI?.onUpdaterChecking?.(() => {
      setUpdateChecking(true);
      setUpdateStatusMsg('Проверка обновлений...');
    });
    window.electronAPI?.onUpdaterAvailable?.((info) => {
      setUpdateChecking(false);
      setUpdateStatusMsg(`Найдено обновление ${info.version}, загружается...`);
    });
    window.electronAPI?.onUpdaterNotAvailable?.(() => {
      setUpdateChecking(false);
      setUpdateStatusMsg('У вас последняя версия');
    });
    window.electronAPI?.onUpdaterError?.((msg) => {
      setUpdateChecking(false);
      setUpdateStatusMsg(`Ошибка проверки обновления: ${msg}`);
    });
  }, []);

  const handleCheckUpdate = () => {
    setUpdateChecking(true);
    setUpdateStatusMsg('Проверка обновлений...');
    window.electronAPI?.updaterCheck?.().then((res) => {
      if (res && res.checking === false) {
        // Например dev-режим — автообновление отключено, событий не будет
        setUpdateChecking(false);
        setUpdateStatusMsg('Проверка обновлений недоступна (dev-режим)');
      }
    });
  };

  const handleRamChange = (val: number) => {
    setRam(val);
    localStorage.setItem('ram', String(val));
  };

  const handleJavaPathChange = (val: string) => {
    setJavaPath(val);
    localStorage.setItem('javaPath', val);
  };

  const handleBrowseJava = async () => {
    if (window.electronAPI?.browseJavaPath) {
      const picked = await window.electronAPI.browseJavaPath();
      if (picked) handleJavaPathChange(picked);
    }
  };

  const handleElyOAuthLogin = async () => {
    setElyLoading(true);
    setElyError('');
    try {
      const result = await window.electronAPI?.elyOAuthLogin();
      if (result?.success) {
        onElyAccountChange(result.account);
      } else {
        const msg = result?.error || '';
        if (msg.includes('timeout')) setElyError('Время ожидания истекло');
        else if (msg.includes('cancel') || msg.includes('denied')) setElyError('Вход отменён');
        else setElyError('Не удалось войти');
      }
    } catch {
      setElyError('Ошибка подключения');
    } finally {
      setElyLoading(false);
    }
  };

  const handleElyLogout = async () => {
    if (!elyAccount) return;
    try { await window.electronAPI?.elyLogout(elyAccount.accessToken, elyAccount.clientToken); } catch {}
    onElyAccountChange(null);
  };

  const openImport = async () => {
    setImportOpen(true);
    setImportDone(false);
    setSelectedSource(null);
    setSelectedFolders([]);
    const found = await window.electronAPI?.importDetectLaunchers() ?? [];
    setLaunchers(found);
  };

  const selectLauncher = (launcher: LauncherInstall) => {
    setSelectedSource(launcher);
    setSelectedFolders([...launcher.folders]);
    setImportDone(false);
  };

  const handleBrowseImport = async () => {
    const picked = await window.electronAPI?.importBrowseFolder();
    if (!picked) return;
    const folders = await window.electronAPI?.importGetFolders(picked) ?? [];
    const custom: LauncherInstall = { name: 'Свой путь', path: picked, folders };
    setLaunchers((prev) => {
      const filtered = prev.filter((l) => l.name !== 'Свой путь');
      return [...filtered, custom];
    });
    selectLauncher(custom);
  };

  const toggleFolder = (folder: string) => {
    setSelectedFolders((prev) =>
      prev.includes(folder) ? prev.filter((f) => f !== folder) : [...prev, folder]
    );
  };

  const runImport = async () => {
    if (!selectedSource || selectedFolders.length === 0) return;
    setImporting(true);
    setImportProgress(0);
    setImportStatus('Подготовка...');
    setImportDone(false);
    
    // Передаём версию только если импортируем моды
    const version = selectedFolders.includes('mods') ? selectedVersion : undefined;
    
    const result = await window.electronAPI?.importRun(selectedSource.path, selectedFolders, version);
    setImporting(false);
    setImportDone(true);
    setImportStatus(result?.success ? `Готово! Скопировано файлов: ${result.imported}` : `Ошибка: ${result?.error}`);
  };

  const getRamProgress = () => ((ram - 1024) / (maxRam - 1024)) * 100;
  const formatMemory = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

  return (
    <div className="settings-view">
      <div className="setting-box setting-ram">
        <label>
          <span>RAM</span>
          <span className="ram-value">
            {formatMemory(ram)}
            <span style={{ fontSize: '11px', fontFamily: 'SFRegular', color: 'var(--text-color-grayed)', marginLeft: '4px' }}>
              / {formatMemory(maxRam)}
            </span>
          </span>
        </label>
        <input
          type="range" min="1024" max={maxRam} step="100" value={ram}
          onChange={(e) => handleRamChange(Number(e.target.value))}
          style={{ background: `linear-gradient(to right, var(--accent-color-mixed) 0%, var(--accent-color-mixed) ${getRamProgress()}%, #2b2b2ba6 ${getRamProgress()}%, #2b2b2ba6 100%)` }}
        />
      </div>

      <div className="setting-box setting-java">
        <label className="setting-label-row">
          <span>Java</span>
          <span className="setting-hint">Оставьте пустым для автоопределения</span>
        </label>
        <div className="java-input-row">
          <input type="text" className="java-path-input" placeholder="Путь к java.exe..."
            value={javaPath} onChange={(e) => handleJavaPathChange(e.target.value)} spellCheck={false} />
          <button className="java-browse-btn" onClick={handleBrowseJava} title="Выбрать файл">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.764c.958 0 1.408 1.167.707 1.707L6.207 4.5H12.5A1.5 1.5 0 0 1 14 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V3.5z" fill="currentColor" opacity=".8"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="setting-box setting-ely">
        <label className="setting-label-row">
          <span>Аккаунт Ely.by</span>
          <span className="setting-hint">Для доступа к лицензионным серверам</span>
        </label>
        {elyAccount ? (
          <div className="ely-account-info">
            <div className="ely-account-status">
              <div className="ely-username">{elyAccount.username}</div>
              <div className="ely-status">Подключено</div>
            </div>
            <button className="ely-logout-btn" onClick={handleElyLogout}>Выйти</button>
          </div>
        ) : (
          <>
            <button className="ely-login-btn" onClick={handleElyOAuthLogin} disabled={elyLoading}>
              {elyLoading ? 'Открываем браузер...' : 'Войти через Ely.by'}
            </button>
            {elyError && <div className="ely-error">{elyError}</div>}
          </>
        )}
      </div>

      <div className="setting-box setting-import">
        <label className="setting-label-row">
          <span>Импорт данных</span>
          <span className="setting-hint">Перенос из TLauncher / Legacy</span>
        </label>
        {!importOpen ? (
          <button className="import-open-btn" onClick={openImport}>
            Импортировать из другого лаунчера
          </button>
        ) : (
          <div className="import-panel">
            <div className="import-launchers">
              {launchers.length === 0 && (
                <div className="import-empty">Лаунчеры не найдены автоматически</div>
              )}
              {launchers.map((l) => (
                <div
                  key={l.path}
                  className={`import-launcher-item ${selectedSource?.path === l.path ? 'selected' : ''}`}
                  onClick={() => selectLauncher(l)}
                >
                  <div className="import-launcher-name">{l.name}</div>
                  <div className="import-launcher-path">{l.path}</div>
                </div>
              ))}
              <button className="import-browse-btn" onClick={handleBrowseImport}>
                Указать путь вручную
              </button>
            </div>

            {selectedSource && selectedSource.folders.length > 0 && (
              <>
                <div className="import-folders">
                  <div className="import-folders-label">Что копировать:</div>
                  <div className="import-folders-grid">
                    {selectedSource.folders.map((folder) => (
                      <label key={folder} className="import-folder-check">
                        <input
                          type="checkbox"
                          checked={selectedFolders.includes(folder)}
                          onChange={() => toggleFolder(folder)}
                          disabled={importing}
                        />
                        <span>{FOLDER_LABELS[folder] || folder}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {selectedFolders.includes('mods') && (
                  <div className="import-version-select">
                    <div className="import-version-label">Версия Minecraft (для фильтрации модов):</div>
                    <div className="import-version-buttons">
                      <button
                        className={`import-version-btn ${selectedVersion === '1.16.5' ? 'active' : ''}`}
                        onClick={() => setSelectedVersion('1.16.5')}
                        disabled={importing}
                      >
                        1.16.5
                      </button>
                      <button
                        className={`import-version-btn ${selectedVersion === '1.21.11' ? 'active' : ''}`}
                        onClick={() => setSelectedVersion('1.21.11')}
                        disabled={importing}
                      >
                        1.21.11
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {importing && (
              <div className="import-progress-wrap">
                <div className="import-progress-bar-bg">
                  <div className="import-progress-bar" style={{ width: `${importProgress}%` }} />
                </div>
                <div className="import-progress-status">{importStatus}</div>
              </div>
            )}

            {importDone && (
              <div className={`import-result ${importStatus.startsWith('Ошибка') ? 'import-result-error' : ''}`}>
                {importStatus}
              </div>
            )}

            <div className="import-actions">
              {!importDone && (
                <button
                  className="import-run-btn"
                  onClick={runImport}
                  disabled={importing || !selectedSource || selectedFolders.length === 0}
                >
                  {importing ? 'Копирование...' : 'Импортировать'}
                </button>
              )}
              <button className="import-cancel-btn" onClick={() => setImportOpen(false)} disabled={importing}>
                {importDone ? 'Закрыть' : 'Отмена'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="setting-double">
        <div className="setting-box">
          <label>Папка с ресурсами</label>
        </div>
        <button className="setting-btn icon-font" onClick={() => window.electronAPI?.openResourcepacksFolder()}>
          <span className="icon-font">P</span> Открыть
        </button>
      </div>

      <div className="setting-box setting-update">
        <label className="setting-label-row">
          <span>Обновления</span>
          <span className="setting-hint">Версия: {appVersion || '...'}</span>
        </label>
        <div className="java-input-row">
          <button className="ely-login-btn" onClick={handleCheckUpdate} disabled={updateChecking}>
            {updateChecking ? 'Проверка...' : 'Проверить обновление'}
          </button>
        </div>
        {updateStatusMsg && (
          <div className={`import-result ${updateStatusMsg.startsWith('Ошибка') ? 'import-result-error' : ''}`}>
            {updateStatusMsg}
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsView;
