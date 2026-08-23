import React, { useEffect, useRef, useState } from 'react';
import './HomeView.css';
import img1211 from '../../../public/assets/asset_3.png';
import img1165 from '../../../public/assets/asset_4.png';
import imgCustom from '../../../public/assets/asset_5.png';
import imgRelease from '../../../public/assets/asset_7.png';
import imgSnapshot from '../../../public/assets/asset_8.png';
import imgBeta from '../../../public/assets/asset_9.png';
import imgAlpha from '../../../public/assets/asset_10.png';

interface ElyAccount {
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}

interface McVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  releaseTime: string;
}

interface SavedVersion {
  versionId: string;
  type: McVersion['type'];
  fabric: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      launchGame: (options: any) => Promise<void>;
      downloadVersion: (versionId: string) => Promise<void>;
      verifyVersion: (versionId: string) => Promise<void>;
      installFabric: (mcVersionId: string) => Promise<string>;
      getMinecraftVersions: () => Promise<McVersion[]>;
      onDownloadProgress: (callback: (data: any) => void) => void;
      onGameLog: (callback: (data: { line: string }) => void) => void;
    };
  }
}

const TYPE_LABELS: Record<string, string> = {
  release:   'Release',
  snapshot:  'Snapshot',
  old_beta:  'Beta',
  old_alpha: 'Alpha',
};

const TYPE_COLORS: Record<string, string> = {
  release:   'var(--accent-color-mixed)',
  snapshot:  '#e8a838',
  old_beta:  '#6c8ebf',
  old_alpha: '#9b6c9b',
};

const TYPE_IMG: Record<string, string> = {
  release:   imgRelease,
  snapshot:  imgSnapshot,
  old_beta:  imgBeta,
  old_alpha: imgAlpha,
};

const FEATURED = [
  { id: 1, versionId: '1.21.11', name: 'Minecraft 1.21.11', subtitle: 'Tricky Trials + Fabric', image: img1211, fabric: true },
  { id: 2, versionId: '1.16.5',  name: 'Minecraft 1.16.5',  subtitle: 'Nether Update + Fabric',  image: img1165,  fabric: true },
];

const SAVED_KEY = 'savedVersions';

function loadSaved(): SavedVersion[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
  } catch {
    return [];
  }
}

const PAGE_SIZE = 12;

function HomeView({ username, elyAccount }: { username: string; elyAccount: ElyAccount | null }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [logs, setLogs] = useState<{ text: string; type: string }[]>([]);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Сохранённые пользователем версии
  const [savedVersions, setSavedVersions] = useState<SavedVersion[]>(loadSaved);

  // Versions modal
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [allVersions, setAllVersions] = useState<McVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('release');
  const [page, setPage] = useState(0);
  const [useFabricCustom, setUseFabricCustom] = useState(false);

  useEffect(() => {
    window.electronAPI?.onDownloadProgress((data) => {
      setDownloadProgress(data.percent);
      setDownloadStatus(data.status);
      if (data.status && (data.percent % 10 === 0 || data.percent === 100 || data.percent === 0)) {
        setLogs((prev) => [
          ...prev.slice(-800),
          { text: `[${data.percent}%] ${data.status}`, type: data.percent === 100 ? 'info' : 'default' },
        ]);
      }
    });

    window.electronAPI?.onGameLog?.((data) => {
      const lines = data.line.split('\n').filter((l) => l.trim().length > 0);
      setLogs((prev) => [
        ...prev.slice(-800),
        ...lines.map((text) => ({ text, type: getLogType(text) })),
      ]);
    });
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, typeFilter]);

  const openVersionsModal = async () => {
    setVersionsModalOpen(true);
    if (allVersions.length > 0) return;
    if (!window.electronAPI?.getMinecraftVersions) {
      setVersionsError('API недоступен');
      return;
    }
    setVersionsLoading(true);
    setVersionsError('');
    try {
      const list = await window.electronAPI.getMinecraftVersions();
      setAllVersions(list ?? []);
    } catch (e: any) {
      console.error('getMinecraftVersions error:', e);
      setVersionsError('Не удалось загрузить список версий');
    } finally {
      setVersionsLoading(false);
    }
  };

  function getLogType(line: string): string {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('exception') || l.includes('crash')) return 'error';
    if (l.includes('warn')) return 'warn';
    if (l.includes('/info]') || l.includes('[info]')) return 'info';
    return 'default';
  }

  const addSavedVersion = (v: McVersion, fabric: boolean) => {
    // Не добавлять если уже есть в FEATURED или savedVersions
    const featuredIds = FEATURED.map((f) => f.versionId);
    if (featuredIds.includes(v.id)) return;
    setSavedVersions((prev) => {
      if (prev.find((s) => s.versionId === v.id)) return prev;
      const next = [...prev, { versionId: v.id, type: v.type, fabric }];
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const removeSavedVersion = (versionId: string) => {
    setSavedVersions((prev) => {
      const next = prev.filter((s) => s.versionId !== versionId);
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleLaunch = async (versionId: string, useFabric: boolean, mcVersion?: McVersion) => {
    if (!window.electronAPI) return;

    // Закрываем модал и добавляем карточку сразу
    setVersionsModalOpen(false);
    if (mcVersion) addSavedVersion(mcVersion, useFabric);

    setLogs([]);
    setDownloading(versionId);
    setDownloadProgress(0);
    setDownloadStatus('Проверка файлов...');

    try {
      await window.electronAPI.downloadVersion(versionId);
      await window.electronAPI.verifyVersion(versionId);

      let fabricVersionId: string | undefined;
      if (useFabric) {
        setDownloadStatus('Установка Fabric...');
        fabricVersionId = await window.electronAPI.installFabric(versionId);
      }

      const savedJava = localStorage.getItem('javaPath') || undefined;
      const savedRam = Number(localStorage.getItem('ram')) || 2048;
      await window.electronAPI.launchGame({
        versionId,
        username,
        maxMemory: savedRam,
        fabricVersionId,
        javaPath: savedJava || undefined,
        uuid: elyAccount?.uuid,
        accessToken: elyAccount?.accessToken,
      });

      setDownloading(null);
    } catch (err: any) {
      console.error('Launch error:', err);
      setLogs((prev) => [...prev, { text: `[ОШИБКА] ${err.message}`, type: 'error' }]);
      setLogsModalOpen(true);
      setDownloading(null);
    }
  };

  const copyLogs = () => {
    const text = logs.map((e) => e.text).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const filteredVersions = allVersions.filter((v) => {
    const matchType = typeFilter === 'all' || v.type === typeFilter;
    const matchSearch = v.id.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchType && matchSearch;
  });

  const totalPages = Math.ceil(filteredVersions.length / PAGE_SIZE);
  const pageVersions = filteredVersions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const allTypes = [
    { key: 'release',   label: 'Release'  },
    { key: 'snapshot',  label: 'Snapshot' },
    { key: 'old_beta',  label: 'Beta'     },
    { key: 'old_alpha', label: 'Alpha'    },
  ];

  // Ищем McVersion объект по id (для передачи в handleLaunch из карточки)
  const findMcVersion = (id: string): McVersion | undefined =>
    allVersions.find((v) => v.id === id);

  return (
    <div className="home-view">

      {/* ── Карточки версий ── */}
      <div className="versions-grid">

        {/* Захардкоженные карточки */}
        {FEATURED.map((version) => {
          const isDownloading = downloading === version.versionId;
          return (
            <div key={version.id} className="version-card">
              <img src={version.image} alt={version.name} className="version-image" />
              <div className="version-content">
                <div className="version-title">{version.name}</div>
                <div className="version-subtitle">{version.subtitle}</div>
              </div>
              {isDownloading ? (
                <div className="version-downloading">
                  <div className="download-spinner">
                    <div className="spinner-icon"></div>
                    <div className="download-status">{downloadStatus}</div>
                  </div>
                  <div className="download-progress">
                    <div className="progress-bar" style={{ width: `${downloadProgress}%` }}></div>
                  </div>
                </div>
              ) : (
                <div className="version-actions">
                  <div className="version-log-btn" onClick={() => setLogsModalOpen(true)} title="Логи">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="5.5" width="8" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="9" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                  </div>
                  <div className="version-play" onClick={() => handleLaunch(version.versionId, version.fabric)}>
                    <svg viewBox="0 0 8 8" fill="none">
                      <path d="M0 3.99004V2.32588C0 0.253161 1.46609 -0.593864 3.2613 0.442496L4.70745 1.27956L6.15359 2.11662C7.9488 3.15298 7.9488 4.84702 6.15359 5.88338L4.70745 6.72044L3.2613 7.5575C1.46609 8.59386 0 7.74684 0 5.67412V3.99004Z" fill="white"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Карточки сохранённых версий */}
        {savedVersions.map((sv) => {
          const isDownloading = downloading === sv.versionId;
          const color = TYPE_COLORS[sv.type] ?? 'var(--accent-color-mixed)';
          return (
            <div
              key={sv.versionId}
              className="version-card version-card--custom"
              style={{ '--card-accent': color } as React.CSSProperties}
            >
              <img src={TYPE_IMG[sv.type] ?? imgCustom} alt={sv.versionId} className="version-image" />
              <div className="version-content">
                <div className="version-badge-label" style={{ color }}>
                  {TYPE_LABELS[sv.type] ?? sv.type}{sv.fabric ? ' + Fabric' : ''}
                </div>
                <div className="version-title">{sv.versionId}</div>
              </div>

              {/* Кнопка удалить */}
              <button
                className="version-remove-btn"
                onClick={(e) => { e.stopPropagation(); removeSavedVersion(sv.versionId); }}
                title="Убрать"
              >✕</button>

              {isDownloading ? (
                <div className="version-downloading">
                  <div className="download-spinner">
                    <div className="spinner-icon"></div>
                    <div className="download-status">{downloadStatus}</div>
                  </div>
                  <div className="download-progress">
                    <div className="progress-bar" style={{ width: `${downloadProgress}%` }}></div>
                  </div>
                </div>
              ) : (
                <div className="version-actions">
                  <div className="version-log-btn" onClick={() => setLogsModalOpen(true)} title="Логи">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="5.5" width="8" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="9" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                  </div>
                  <div className="version-play" onClick={() => handleLaunch(sv.versionId, sv.fabric, findMcVersion(sv.versionId))}>
                    <svg viewBox="0 0 8 8" fill="none">
                      <path d="M0 3.99004V2.32588C0 0.253161 1.46609 -0.593864 3.2613 0.442496L4.70745 1.27956L6.15359 2.11662C7.9488 3.15298 7.9488 4.84702 6.15359 5.88338L4.70745 6.72044L3.2613 7.5575C1.46609 8.59386 0 7.74684 0 5.67412V3.99004Z" fill="white"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Кнопка "Другая версия" */}
        <div className="version-card version-card--more" onClick={openVersionsModal}>
          <div className="version-card-more-inner">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.4"/>
              <rect x="9.25" y="5" width="1.5" height="10" rx="0.75" fill="currentColor"/>
              <rect x="5" y="9.25" width="10" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
            <span>Другая версия</span>
          </div>
        </div>
      </div>

      {/* ── Модал выбора версий ── */}
      {versionsModalOpen && (
        <div className="modal-overlay" onClick={() => setVersionsModalOpen(false)}>
          <div className="versions-modal" onClick={(e) => e.stopPropagation()}>

            <div className="versions-modal-header">
              <span className="versions-modal-title">Выбор версии</span>
              <div className="versions-modal-header-right">
                <button
                  className={`fabric-toggle${useFabricCustom ? ' active' : ''}`}
                  onClick={() => setUseFabricCustom((v) => !v)}
                >
                  Fabric
                </button>
                <button className="modal-close-btn" onClick={() => setVersionsModalOpen(false)}>✕</button>
              </div>
            </div>

            <div className="versions-modal-controls">
              <div className="type-filters">
                {allTypes.map(({ key, label }) => (
                  <button
                    key={key}
                    className={`type-pill${typeFilter === key ? ' active' : ''}`}
                    style={typeFilter === key ? { '--pill-color': TYPE_COLORS[key] } as React.CSSProperties : {}}
                    onClick={() => setTypeFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="version-search-wrap">
                <svg className="version-search-icon" width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M9 9L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <input
                  className="version-search"
                  type="text"
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button className="version-search-clear" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>
            </div>

            <div className="versions-modal-body">
              {versionsLoading ? (
                <div className="versions-state-msg">
                  <div className="spinner-icon"></div>
                  <span>Загрузка...</span>
                </div>
              ) : versionsError ? (
                <div className="versions-state-msg versions-state-msg--col">
                  <span>{versionsError}</span>
                  <button className="retry-btn" onClick={openVersionsModal}>Повторить</button>
                </div>
              ) : pageVersions.length === 0 ? (
                <div className="versions-state-msg">Версии не найдены</div>
              ) : (
                pageVersions.map((v) => {
                  const isActive = downloading === v.id;
                  const date = new Date(v.releaseTime).toLocaleDateString('ru-RU', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                  });
                  return (
                    <div key={v.id} className={`version-row${isActive ? ' version-row--active' : ''}`}>
                      <span className="vrow-badge" style={{ color: TYPE_COLORS[v.type] }}>
                        {TYPE_LABELS[v.type] ?? v.type}
                      </span>
                      <span className="vrow-id">{v.id}</span>
                      <span className="vrow-date">{date}</span>
                      <div className="vrow-actions">
                        {isActive ? (
                          <div className="vrow-progress-wrap">
                            <div className="vrow-status">{downloadStatus}</div>
                            <div className="vrow-progress-bar-bg">
                              <div className="vrow-progress-bar" style={{ width: `${downloadProgress}%` }}></div>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="vrow-play-btn"
                            onClick={() => handleLaunch(v.id, useFabricCustom, v)}
                            title="Установить и запустить"
                          >
                            <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                              <path d="M0 3.99004V2.32588C0 0.253161 1.46609 -0.593864 3.2613 0.442496L4.70745 1.27956L6.15359 2.11662C7.9488 3.15298 7.9488 4.84702 6.15359 5.88338L4.70745 6.72044L3.2613 7.5575C1.46609 8.59386 0 7.74684 0 5.67412V3.99004Z" fill="white"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {!versionsLoading && !versionsError && totalPages > 1 && (
              <div className="versions-pagination">
                <button className="page-btn" disabled={page === 0} onClick={() => setPage(0)} title="Первая">«</button>
                <button className="page-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
                <span className="page-info">{page + 1} / {totalPages}</span>
                <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
                <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} title="Последняя">»</button>
                <span className="page-total">{filteredVersions.length} версий</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Модал логов ── */}
      {logsModalOpen && (
        <div className="modal-overlay" onClick={() => setLogsModalOpen(false)}>
          <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="logs-modal-header">
              <span className="logs-modal-title">Логи</span>
              <div className="logs-modal-actions">
                {logs.length > 0 && (
                  <button className="log-copy-btn" onClick={copyLogs} title="Скопировать">
                    {copied ? (
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                        <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                      </svg>
                    )}
                  </button>
                )}
                <button className="modal-close-btn" onClick={() => setLogsModalOpen(false)}>✕</button>
              </div>
            </div>
            <div className="logs-modal-body">
              {logs.length === 0 ? (
                <div className="log-empty">Запустите игру чтобы увидеть логи</div>
              ) : (
                logs.map((entry, i) => (
                  <div key={i} className={`log-line log-${entry.type}`}>
                    {entry.text}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomeView;
