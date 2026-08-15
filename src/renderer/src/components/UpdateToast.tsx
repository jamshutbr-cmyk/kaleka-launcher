import React, { useState, useEffect } from 'react';
import './UpdateToast.css';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string };

export function UpdateToast() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onUpdaterAvailable?.((info) => {
      setState({ phase: 'downloading', version: info.version, percent: 0 });
    });

    api.onUpdaterProgress?.((p) => {
      setState((prev) =>
        prev.phase === 'downloading'
          ? { ...prev, percent: p.percent }
          : prev
      );
    });

    api.onUpdaterDownloaded?.((info) => {
      setState({ phase: 'ready', version: info.version });
    });

    api.onUpdaterError?.(() => {
      setState({ phase: 'idle' });
    });
  }, []);

  if (state.phase === 'idle') return null;

  return (
    <div className="update-toast">
      <div className="update-toast-icon">
        {state.phase === 'ready' ? '↑' : '↓'}
      </div>
      <div className="update-toast-body">
        {state.phase === 'downloading' && (
          <>
            <div className="update-toast-title">
              Обновление {state.version}
            </div>
            <div className="update-toast-sub">
              Загрузка... {state.percent}%
            </div>
            <div className="update-toast-bar">
              <div
                className="update-toast-bar-fill"
                style={{ width: `${state.percent}%` }}
              />
            </div>
          </>
        )}
        {state.phase === 'ready' && (
          <>
            <div className="update-toast-title">
              Обновление {state.version} готово
            </div>
            <div className="update-toast-sub">
              Перезапустите лаунчер для установки
            </div>
          </>
        )}
      </div>
      {state.phase === 'ready' && (
        <button
          className="update-toast-btn"
          onClick={() => window.electronAPI?.updaterInstall?.()}
        >
          Перезапустить
        </button>
      )}
    </div>
  );
}
