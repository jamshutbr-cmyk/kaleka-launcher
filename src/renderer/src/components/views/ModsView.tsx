import React, { useState, useEffect } from 'react';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import './ModsView.css';

interface ModInfo {
  fileName: string;
  name: string;
  version: string;
  description?: string;
  authors?: string[];
  mcVersion?: string;
  modLoader?: 'fabric' | 'forge' | 'unknown';
  enabled: boolean;
  filePath: string;
  iconBase64?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      modsGetList: () => Promise<{ success: boolean; mods?: ModInfo[]; error?: string }>;
      modsToggle: (modPath: string) => Promise<{ success: boolean; enabled?: boolean; error?: string }>;
      modsDelete: (modPath: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

function ModsView() {
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [versionFilter, setVersionFilter] = useState<'all' | '1.16.5' | '1.21.11'>('all');
  const [confirmDialog, setConfirmDialog] = useState<{ mod: ModInfo } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadMods();
  }, []);

  const loadMods = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.modsGetList();
      if (result?.success && result.mods) {
        console.log('Loaded mods:', result.mods.map(m => ({
          name: m.name,
          hasIcon: !!m.iconBase64,
          iconLength: m.iconBase64?.length || 0
        })));
        setMods(result.mods);
      } else {
        showToast('Не удалось загрузить моды', 'error');
      }
    } catch (err) {
      console.error('Failed to load mods:', err);
      showToast('Ошибка загрузки модов', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMod = async (mod: ModInfo) => {
    try {
      const result = await window.electronAPI?.modsToggle(mod.filePath);
      if (result?.success) {
        setMods((prev) =>
          prev.map((m) =>
            m.filePath === mod.filePath ? { ...m, enabled: result.enabled! } : m
          )
        );
        showToast(
          result.enabled ? `Мод "${mod.name}" включен` : `Мод "${mod.name}" отключен`,
          'success'
        );
      } else {
        showToast('Не удалось переключить мод', 'error');
      }
    } catch (err) {
      console.error('Failed to toggle mod:', err);
      showToast('Ошибка переключения мода', 'error');
    }
  };

  const handleDeleteMod = async (mod: ModInfo) => {
    setConfirmDialog({ mod });
  };

  const confirmDeleteMod = async () => {
    if (!confirmDialog) return;

    try {
      const result = await window.electronAPI?.modsDelete(confirmDialog.mod.filePath);
      if (result?.success) {
        setMods((prev) => prev.filter((m) => m.filePath !== confirmDialog.mod.filePath));
        showToast(`Мод "${confirmDialog.mod.name}" удален`, 'success');
      } else {
        showToast('Не удалось удалить мод', 'error');
      }
    } catch (err) {
      console.error('Failed to delete mod:', err);
      showToast('Ошибка удаления мода', 'error');
    } finally {
      setConfirmDialog(null);
    }
  };

  const filteredMods = mods.filter((mod) => {
    // Фильтр по состоянию
    if (filter === 'enabled' && !mod.enabled) return false;
    if (filter === 'disabled' && mod.enabled) return false;

    // Фильтр по версии
    if (versionFilter !== 'all') {
      if (!mod.mcVersion) return false;
      // Простая проверка совместимости
      if (!mod.mcVersion.includes(versionFilter)) return false;
    }

    // Поиск по названию
    if (searchQuery && !mod.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    return true;
  });

  const enabledCount = mods.filter((m) => m.enabled).length;
  const disabledCount = mods.filter((m) => !m.enabled).length;

  const getLoaderIcon = (loader?: string) => {
    if (loader === 'fabric') return 'F';
    if (loader === 'forge') return 'G';
    return '?';
  };

  return (
    <div className="mods-view">
      {/* Confirm dialog */}
      {confirmDialog && (
        <ConfirmDialog
          title="Удалить мод"
          message={`Вы уверены, что хотите удалить мод "${confirmDialog.mod.name}"?`}
          confirmText="Удалить"
          cancelText="Отмена"
          onConfirm={confirmDeleteMod}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Header with stats */}
      <div className="mods-header">
        <div className="mods-stats">
          <div className="mods-stat">
            <span className="stat-value">{mods.length}</span>
            <span className="stat-label">Всего</span>
          </div>
          <div className="mods-stat enabled">
            <span className="stat-value">{enabledCount}</span>
            <span className="stat-label">Включено</span>
          </div>
          <div className="mods-stat disabled">
            <span className="stat-value">{disabledCount}</span>
            <span className="stat-label">Отключено</span>
          </div>
        </div>

        <button className="mods-refresh-btn" onClick={loadMods} disabled={loading}>
          <span className="icon-font">↻</span> Обновить
        </button>
      </div>

      {/* Filters */}
      <div className="mods-filters">
        <div className="mods-search">
          <input
            type="text"
            placeholder="Поиск модов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="mods-filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button
            className={`filter-btn ${filter === 'enabled' ? 'active' : ''}`}
            onClick={() => setFilter('enabled')}
          >
            Включенные
          </button>
          <button
            className={`filter-btn ${filter === 'disabled' ? 'active' : ''}`}
            onClick={() => setFilter('disabled')}
          >
            Отключенные
          </button>
        </div>

        <div className="mods-version-filter">
          <select value={versionFilter} onChange={(e) => setVersionFilter(e.target.value as any)}>
            <option value="all">Все версии</option>
            <option value="1.16.5">1.16.5</option>
            <option value="1.21.11">1.21.11</option>
          </select>
        </div>
      </div>

      {/* Mods List */}
      <div className="mods-list">
        {loading ? (
          <div className="mods-loading">
            <div className="spinner"></div>
            <span>Загрузка модов...</span>
          </div>
        ) : filteredMods.length === 0 ? (
          <div className="mods-empty">
            {mods.length === 0 ? (
              <>
                <div className="empty-icon empty-icon-box"></div>
                <span>Моды не найдены</span>
                <span className="empty-hint">Добавьте .jar файлы в папку mods</span>
              </>
            ) : (
              <>
                <div className="empty-icon empty-icon-search"></div>
                <span>Ничего не найдено</span>
                <span className="empty-hint">Попробуйте изменить фильтры</span>
              </>
            )}
          </div>
        ) : (
          filteredMods.map((mod) => (
            <div key={mod.filePath} className={`mod-item ${!mod.enabled ? 'disabled' : ''}`}>
              <div className="mod-checkbox">
                <input
                  type="checkbox"
                  checked={mod.enabled}
                  onChange={() => handleToggleMod(mod)}
                />
              </div>

              {/* Иконка мода */}
              <div className="mod-icon">
                {mod.iconBase64 ? (
                  <img 
                    src={`data:image/png;base64,${mod.iconBase64}`} 
                    alt={mod.name}
                    onError={(e) => {
                      // Fallback на SVG иконку при ошибке загрузки
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling;
                      if (fallback) fallback.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <span className={`mod-loader-fallback ${mod.iconBase64 ? 'hidden' : ''}`} title={mod.modLoader}></span>
              </div>

              <div className="mod-info">
                <div className="mod-header-line">
                  <span className="mod-name">{mod.name}</span>
                  <span className="mod-version">{mod.version}</span>
                </div>

                {mod.description && (
                  <div className="mod-description">{mod.description}</div>
                )}

                <div className="mod-meta">
                  {mod.authors && mod.authors.length > 0 && (
                    <span className="mod-authors">By: {mod.authors.join(', ')}</span>
                  )}
                  {mod.mcVersion && (
                    <span className="mod-mc-version">MC: {mod.mcVersion}</span>
                  )}
                </div>
              </div>

              <div className="mod-actions">
                <button
                  className="mod-delete-btn"
                  onClick={() => handleDeleteMod(mod)}
                  title="Удалить мод"
                >
                  X
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ModsView;
