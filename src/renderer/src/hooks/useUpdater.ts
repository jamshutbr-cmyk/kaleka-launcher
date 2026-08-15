import { useEffect } from 'react';
import { useToast } from '../components/Toast';

export function useUpdater() {
  const { showToast } = useToast();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onUpdaterAvailable?.((info) => {
      showToast(`Найдено обновление ${info.version}, загружается...`, 'info', 5000);
    });

    api.onUpdaterDownloaded?.((info) => {
      // Показываем постоянный toast с кнопкой — через кастомный тип
      showToast(
        `Обновление ${info.version} готово. Перезапустите лаунчер для установки.`,
        'success',
        10000
      );
    });

    api.onUpdaterError?.((msg) => {
      console.error('Updater error:', msg);
    });
  }, []);
}
