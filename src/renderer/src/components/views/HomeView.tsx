import React, { useEffect, useRef, useState } from 'react';
import './HomeView.css';
import { useToast } from '../Toast';
import img1211 from '../../../public/assets/asset_3.png';
import img1165 from '../../../public/assets/asset_4.png';

interface ElyAccount {
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}

declare global {
  interface Window {
    electronAPI?: {
      launchGame: (options: any) => Promise<void>;
      downloadVersion: (versionId: string) => Promise<void>;
      verifyVersion: (versionId: string) => Promise<void>;
      installFabric: (mcVersionId: string) => Promise<string>;
      onDownloadProgress: (callback: (data: any) => void) => void;
      onGameLog: (callback: (data: { line: string }) => void) => void;
    };
  }
}

function HomeView({ username, elyAccount }: { username: string; elyAccount: ElyAccount | null }) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [logs, setLogs] = useState<{ text: string; type: string }[]>([]);
  const [logsOpenFor, setLogsOpenFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI?.onDownloadProgress((data) => {
      setDownloadProgress(data.percent);
      setDownloadStatus(data.status);
      // Add to log panel — show every 10% and key statuses
      if (data.status && (data.percent % 10 === 0 || data.percent === 100 || data.percent === 0)) {
        setLogs((prev) => [
          ...prev.slice(-800),
          { text: `[${data.percent}%] ${data.status}`, type: data.percent === 100 ? 'info' : 'default' },
        ]);
      }
      if (data.percent === 100) {
        setTimeout(() => setDownloading(null), 1000);
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

  function getLogType(line: string): string {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('exception') || l.includes('crash')) return 'error';
    if (l.includes('warn')) return 'warn';
    if (l.includes('/info]') || l.includes('[info]')) return 'info';
    return 'default';
  }

  const versions = [
    { id: 1, versionId: '1.21.11', name: 'Minecraft 1.21.11', subtitle: 'Tricky Trials + Fabric', image: img1211, fabric: true },
    { id: 2, versionId: '1.16.5', name: 'Minecraft 1.16.5', subtitle: 'Nether Update + Fabric', image: img1165, fabric: true },
  ];

  const handleLaunch = async (versionId: string, useFabric: boolean) => {
    if (!window.electronAPI) return;

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
      setLogsOpenFor(versionId);
      setDownloading(null);
    }
  };

  const toggleLogs = (versionId: string) => {
    setLogsOpenFor((cur) => (cur === versionId ? null : versionId));
  };

  const copyLogs = () => {
    const text = logs.map((e) => e.text).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="home-view">
      <div className="versions-grid">
        {versions.map((version) => {
          const isDownloading = downloading === version.versionId;
          const isLogsOpen = logsOpenFor === version.versionId;

          return (
            <div key={version.id} className={`version-card ${isLogsOpen ? 'logs-expanded' : ''}`}>
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
                  <div
                    className="version-log-btn"
                    onClick={() => toggleLogs(version.versionId)}
                    title="Логи"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="5.5" width="8" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="9" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                  </div>
                  <div
                    className="version-play"
                    onClick={() => handleLaunch(version.versionId, version.fabric)}
                  >
                    <svg viewBox="0 0 8 8" fill="none">
                      <path
                        d="M0 3.99004V2.32588C0 0.253161 1.46609 -0.593864 3.2613 0.442496L4.70745 1.27956L6.15359 2.11662C7.9488 3.15298 7.9488 4.84702 6.15359 5.88338L4.70745 6.72044L3.2613 7.5575C1.46609 8.59386 0 7.74684 0 5.67412V3.99004Z"
                        fill="white"
                      />
                    </svg>
                  </div>
                </div>
              )}

              {isLogsOpen && (
                <div className="version-log-panel">
                  <div className="log-panel-header">
                    <span className="log-panel-title">Логи</span>
                    {logs.length > 0 && (
                      <button className="log-copy-btn" onClick={copyLogs} title="Скопировать логи">
                        {copied ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                            <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="log-panel-content">
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HomeView;
