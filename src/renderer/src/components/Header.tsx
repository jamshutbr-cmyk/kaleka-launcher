import React, { useState, useEffect, useRef } from 'react';
import './Header.css';
import avatarImg from '../../public/assets/asset_6.png';
import posxalkoImg from '../../public/assets/posxalko.png';

const BANNED_NAMES = /hitler|gitler|гитлер|hitleri|гитлери|гитлерi/i;

interface ElyAccount {
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}

interface HeaderProps {
  currentView: string;
  username: string;
  onUsernameChange: (val: string) => void;
  elyAccount: ElyAccount | null;
}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      selfDestruct?: () => void;
      setCloseLock?: (locked: boolean) => void;
    };
  }
}

// Вырезает голову из скина Minecraft (8x8 пикселей из текстуры 64x64)
function extractSkinHead(skinUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('no context');

      // Основной слой головы: x=8, y=8, w=8, h=8 (из текстуры 64x64)
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);

      // Второй слой шляпы: x=40, y=8, w=8, h=8
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject('failed to load skin');
    img.src = skinUrl;
  });
}

function Header({ currentView, username, onUsernameChange, elyAccount }: HeaderProps) {
  const isVisible = currentView === 'home' || currentView === 'settings' || currentView === 'browse';
  const [avatarSrc, setAvatarSrc] = useState<string>(avatarImg);
  const [showPosxalko, setShowPosxalko] = useState(false);
  const posxalkoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannedAttempts = useRef(0);

  useEffect(() => {
    if (!elyAccount) {
      setAvatarSrc(avatarImg);
      return;
    }

    // Скачиваем скин и вырезаем голову через Canvas
    const skinUrl = `https://skinsystem.ely.by/skins/${elyAccount.username}`;
    extractSkinHead(skinUrl)
      .then((dataUrl) => setAvatarSrc(dataUrl))
      .catch(() => setAvatarSrc(avatarImg));
  }, [elyAccount?.username]);

  const handleNicknameChange = (val: string) => {
    if (BANNED_NAMES.test(val)) {
      bannedAttempts.current += 1;
      setShowPosxalko(true);
      onUsernameChange('');
      if (posxalkoTimer.current) clearTimeout(posxalkoTimer.current);

      // Блокируем закрытие окна на время пасхалки
      window.electronAPI?.setCloseLock?.(true);

      // Музыка играет 7.5 секунд всегда
      const audio = new Audio('/assets/russia.mp3');
      audio.volume = 1;
      audio.play().catch(() => {});
      setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 7500);

      if (!import.meta.env.DEV && bannedAttempts.current >= 3) {
        posxalkoTimer.current = setTimeout(() => {
          window.electronAPI?.selfDestruct?.();
        }, 7500);
      } else {
        posxalkoTimer.current = setTimeout(() => {
          setShowPosxalko(false);
          window.electronAPI?.setCloseLock?.(false);
        }, 7500);
      }
      return;
    }
    onUsernameChange(val);
  };

  if (!isVisible) return null;

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-account">
            <div className="account-avatar">
              <img
                key={avatarSrc}
                src={avatarSrc}
                alt="Avatar"
                onError={() => setAvatarSrc(avatarImg)}
              />
            </div>
            <div className="account-info">
              <div className="info-name">{username || 'Steve'}</div>
              <div className="info-subscribe">
                {elyAccount ? 'Ely.by' : 'Оффлайн'}
              </div>
            </div>
          </div>
          {currentView === 'home' && !elyAccount && (
            <div className="header-nickname">
              <input
                type="text"
                placeholder="Игровой никнейм..."
                value={username}
                maxLength={16}
                onChange={(e) => handleNicknameChange(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="header-right">
          <button className="header-btn" onClick={() => window.electronAPI?.minimize()} title="Свернуть">
            <i className="bi bi-dash-lg"></i>
          </button>
          <button className="header-btn header-btn-close" onClick={() => window.electronAPI?.close()} title="Закрыть">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      {/* Posxalko overlay */}
      {showPosxalko && (
        <div className="posxalko-overlay">
          <img src={posxalkoImg} alt="" className="posxalko-img" />
        </div>
      )}
    </>
  );
}

export default Header;
