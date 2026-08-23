import React, { useState, useEffect } from 'react';
import './UpdateToast.css';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string };

export function UpdateToast() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Запрашиваем текущее состояние при монтировании
    // (на случай если событие пришло раньше чем компонент смонтировался)
    api.updaterGetState?.().then((s: any) => {
      if (!s || s.phase === 'idle' || s.phase === 'checking') return;
      if (s.phase === 'downloading') {
        setState({ phase: 'downloading', version: s.version || '', percent: s.percent || 0 });
      } else if (s.phase === 'ready') {
        setState({ phase: 'ready', version: s.version || '' });
      }
    });

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

    api.onUpdaterError?.((msg: string) => {
      setState({ phase: 'error', message: msg || 'Неизвестная ошибка обновления' });
    });
  }, []);

  if (state.phase === 'idle') return null;

  return (
    <div className="update-toast">
      <div className={`update-toast-icon${state.phase === 'error' ? ' update-toast-icon-error' : ''}`}>
        {state.phase === 'ready' ? '↑' : state.phase === 'error' ? '!' : '↓'}
      </div>
      <div className="update-toast-body">
        {state.phase === 'downloading' && (
          <>
            <div className="update-toast-title">Обновление {state.version}</div>
            <div className="update-toast-sub">Загрузка... {state.percent}%</div>
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
            <div className="update-toast-title">Обновление {state.version} готово</div>
            <div className="update-toast-sub">Перезапустите лаунчер для установки</div>
          </>
        )}
        {state.phase === 'error' && (
          <>
            <div className="update-toast-title">Ошибка обновления</div>
            <div className="update-toast-sub">{state.message}</div>
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
      {state.phase === 'error' && (
        <button
          className="update-toast-btn"
          onClick={() => {
            setState({ phase: 'idle' });
            window.electronAPI?.updaterCheck?.();
          }}
        >
          Повторить
        </button>
      )}
    </div>
  );
}
