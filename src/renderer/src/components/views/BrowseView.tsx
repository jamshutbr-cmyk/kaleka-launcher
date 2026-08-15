import React, { useState, useCallback, useRef, useEffect } from 'react';
import './BrowseView.css';
import { useToast } from '../Toast';

type Source = 'modrinth' | 'curseforge';

interface Mod {
  id: string;
  name: string;
  description: string;
  downloads: number;
  icon?: string;
  source: Source;
  slug?: string;
  projectUrl?: string;
}

interface ModVersion {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  fileUrl: string;
  fileName: string;
  fileSize: number;
}

declare global {
  interface Window {
    electronAPI?: {
      downloadMod: (url: string, fileName: string) => Promise<void>;
      onModDownloadProgress: (callback: (data: any) => void) => void;
      listMods: () => Promise<string[]>;
    };
  }
}

const GAME_VERSIONS = [
  { value: '1.21.11', label: 'Minecraft 1.21.11' },
  { value: '1.16.5',  label: 'Minecraft 1.16.5'  },
];

async function fetchModrinth(query: string, gameVersion: string, offset: number): Promise<{ hits: Mod[]; total: number }> {
  const facets = JSON.stringify([['project_type:mod'], [`versions:${gameVersion}`]]);
  const params = new URLSearchParams({ facets, limit: '20', offset: String(offset), index: query.trim() ? 'relevance' : 'downloads' });
  if (query.trim()) params.set('query', query);
  const res = await fetch(`https://api.modrinth.com/v2/search?${params}`, { headers: { 'User-Agent': 'KalekaLauncher/1.0.0' } });
  if (!res.ok) throw new Error(`Modrinth: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return {
    total: data.total_hits ?? 0,
    hits: (data.hits ?? []).map((h: any) => ({
      id: h.project_id, name: h.title, description: h.description, downloads: h.downloads,
      icon: h.icon_url, source: 'modrinth' as Source, slug: h.slug,
      projectUrl: `https://modrinth.com/project/${h.slug}`,
    })),
  };
}

async function searchCurseForge(query: string): Promise<Mod[]> {
  return [{ id: 'cf-search', name: `Поиск "${query}" на CurseForge`, description: 'CurseForge API требует ключ. Нажми "Открыть" чтобы перейти на сайт.', downloads: 0, source: 'curseforge' as Source, projectUrl: `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(query)}` }];
}

async function getModVersions(projectId: string, source: Source): Promise<ModVersion[]> {
  if (source !== 'modrinth') return [];
  const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`, { headers: { 'User-Agent': 'KalekaLauncher/1.0.0' } });
  if (!res.ok) throw new Error(`Modrinth: ${res.status}`);
  const data = await res.json();
  return data.map((v: any) => ({ id: v.id, name: v.name, versionNumber: v.version_number, gameVersions: v.game_versions || [], loaders: v.loaders || [], fileUrl: v.files?.[0]?.url || '', fileName: v.files?.[0]?.filename || 'mod.jar', fileSize: v.files?.[0]?.size || 0 }));
}

const fmt = {
  size: (b: number) => b >= 1e6 ? `${(b/1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b/1e3).toFixed(0)} KB` : `${b} B`,
  dl:   (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : String(n),
};

function BrowseView() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Source>('modrinth');
  const [results, setResults] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedMod, setSelectedMod] = useState<Mod | null>(null);
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedGameVersion, setSelectedGameVersion] = useState('1.21.11');
  const [versionOpen, setVersionOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [installedMods, setInstalledMods] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef('');
  const versionRef = useRef('1.21.11');
  const offsetRef = useRef(0);

  const loadMods = useCallback(async (q: string, ver: string, reset: boolean) => {
    const off = reset ? 0 : offsetRef.current;
    if (reset) { setLoading(true); setResults([]); setOffset(0); offsetRef.current = 0; }
    else setLoadingMore(true);
    setError('');
    try {
      const { hits, total } = await fetchModrinth(q, ver, off);
      setResults(prev => reset ? hits : [...prev, ...hits]);
      const newOff = off + hits.length;
      setOffset(newOff);
      offsetRef.current = newOff;
      setHasMore(newOff < total);
      setSearched(true);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Load list of installed mods on mount
  useEffect(() => {
    window.electronAPI?.listMods?.().then(files => {
      setInstalledMods(new Set(files));
    });
  }, []);

  useEffect(() => {
    versionRef.current = selectedGameVersion;
    loadMods(queryRef.current, selectedGameVersion, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameVersion]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading && source === 'modrinth') {
        loadMods(queryRef.current, versionRef.current, false);
      }
    }, { threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, source, loadMods]);

  useEffect(() => {
    if (!versionOpen) return;
    const h = () => setVersionOpen(false);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [versionOpen]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    queryRef.current = val;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (source === 'modrinth') {
      debounceRef.current = setTimeout(() => loadMods(val, versionRef.current, true), 500);
    } else {
      if (!val.trim()) { setResults([]); setSearched(false); }
      else debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try { const d = await searchCurseForge(val); setResults(d); setSearched(true); } finally { setLoading(false); }
      }, 500);
    }
  };

  const handleSourceChange = (src: Source) => {
    setSource(src);
    if (src === 'modrinth') loadMods(queryRef.current, versionRef.current, true);
    else { setResults([]); setSearched(false); setHasMore(false); }
  };

  const handleVersionSelect = (v: string) => {
    setSelectedGameVersion(v);
    versionRef.current = v;
    setVersionOpen(false);
  };

  const handleOpen = async (mod: Mod) => {
    if (mod.source === 'curseforge') { if (mod.projectUrl) window.open(mod.projectUrl, '_blank'); return; }
    setSelectedMod(mod); setLoadingVersions(true);
    try { setVersions(await getModVersions(mod.id, mod.source)); }
    catch (e: any) { setError(e.message); }
    finally { setLoadingVersions(false); }
  };

  const handleDownload = async (ver: ModVersion) => {
    if (!window.electronAPI) { toast('Только в приложении', 'error'); return; }
    setDownloading(ver.id);
    try {
      await window.electronAPI.downloadMod(ver.fileUrl, ver.fileName);
      toast(`${ver.fileName} скачан в папку mods!`, 'success');
      // Refresh installed list
      window.electronAPI?.listMods?.().then(files => setInstalledMods(new Set(files)));
    }
    catch (e: any) { toast(`Ошибка: ${e.message}`, 'error'); }
    finally { setDownloading(null); }
  };

  const closeModal = () => { setSelectedMod(null); setVersions([]); };
  const filteredVersions = versions.filter(v => v.gameVersions.includes(selectedGameVersion));
  const selLabel = GAME_VERSIONS.find(v => v.value === selectedGameVersion)?.label ?? selectedGameVersion;

  return (
    <div className="browse-view">
      <div className="browse-toolbar">
        <div className="browse-search">
          <i className="bi bi-search"></i>
          <input type="text" placeholder="Поиск модов..." value={query} onChange={handleInput} />
        </div>

        <div className="ver-dropdown" onClick={e => { e.stopPropagation(); setVersionOpen(v => !v); }}>
          <span>{selLabel}</span>
          <svg className={`ver-arrow ${versionOpen ? 'open' : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {versionOpen && (
            <div className="ver-menu" onClick={e => e.stopPropagation()}>
              {GAME_VERSIONS.map(v => (
                <div key={v.value} className={`ver-item ${v.value === selectedGameVersion ? 'active' : ''}`} onClick={() => handleVersionSelect(v.value)}>
                  {v.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="browse-tabs">
          <button className={`browse-tab ${source === 'modrinth' ? 'active' : ''}`} onClick={() => handleSourceChange('modrinth')}>Modrinth</button>
          <button className={`browse-tab ${source === 'curseforge' ? 'active' : ''}`} onClick={() => handleSourceChange('curseforge')}>CurseForge</button>
        </div>
      </div>

      {error && <div className="browse-error"><i className="bi bi-exclamation-triangle"></i> {error}</div>}

      <div className="browse-results">
        {loading && <div className="browse-loading"><span className="loader-spin"></span>Загрузка...</div>}
        {!loading && !searched && source === 'curseforge' && <div className="browse-empty"><i className="bi bi-search"></i>Введите название мода</div>}
        {!loading && searched && results.length === 0 && <div className="browse-empty"><i className="bi bi-inbox"></i>Ничего не найдено</div>}
        {!loading && searched && results.length > 0 && (
          <div className="browse-section-label">{query.trim() ? 'Результаты поиска' : `Популярные моды · ${selLabel}`}</div>
        )}
        {!loading && results.map(mod => (
          <div key={mod.id} className="mod-card">
            {mod.icon ? <img src={mod.icon} alt={mod.name} className="mod-icon" /> : <div className="mod-icon-placeholder"><i className="bi bi-box"></i></div>}
            <div className="mod-info">
              <div className="mod-name">{mod.name}</div>
              <div className="mod-description">{mod.description}</div>
              <div className="mod-meta">
                {mod.downloads > 0 && <span className="mod-downloads"><i className="bi bi-download"></i>{fmt.dl(mod.downloads)}</span>}
                <span className={`mod-source-badge ${mod.source}`}>{mod.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</span>
              </div>
            </div>
            <div className="mod-actions">
              <button className="btn-download" onClick={() => handleOpen(mod)}>
                <i className={mod.source === 'modrinth' ? 'bi bi-download' : 'bi bi-box-arrow-up-right'}></i>
                {mod.source === 'modrinth' ? 'Скачать' : 'Открыть'}
              </button>
            </div>
          </div>
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loadingMore && <div className="browse-loading-more"><span className="loader-spin"></span></div>}
      </div>

      {selectedMod && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><h3>{selectedMod.name}</h3><p>Версия для {selLabel}</p></div>
              <button className="modal-close" onClick={closeModal}><i className="bi bi-x-lg"></i></button>
            </div>
            <div className="modal-body">
              {loadingVersions && <div className="browse-loading"><span className="loader-spin"></span>Загрузка версий...</div>}
              {!loadingVersions && filteredVersions.length === 0 && <div className="browse-empty"><i className="bi bi-inbox"></i>Нет версий для {selLabel}</div>}
              {!loadingVersions && filteredVersions.map(ver => (
                <div key={ver.id} className="version-item">
                  <div className="version-info">
                    <div className="version-name">{ver.name}</div>
                    <div className="version-meta">
                      <span className="version-number">{ver.versionNumber}</span>
                      <span className="version-loaders">{ver.loaders.map(l => l[0].toUpperCase() + l.slice(1)).join(', ')}</span>
                      <span className="version-size">{fmt.size(ver.fileSize)}</span>
                    </div>
                  </div>
                  {installedMods.has(ver.fileName) ? (
                    <div className="btn-installed">
                      <i className="bi bi-check-circle-fill"></i>
                      Установлен
                    </div>
                  ) : (
                    <button className="btn-download-version" disabled={downloading === ver.id} onClick={() => handleDownload(ver)}>
                      {downloading === ver.id ? <><span className="loader-spin-small"></span>Скачивание...</> : <><i className="bi bi-download"></i>Скачать</>}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BrowseView;
