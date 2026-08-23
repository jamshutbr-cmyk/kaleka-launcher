import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MainContent from './components/MainContent';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { UpdateToast } from './components/UpdateToast';
import './App.css';

interface ElyAccount {
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}

// Отдельный компонент внутри ToastProvider чтобы useUpdater имел доступ к useToast
function AppInner() {
  const [currentView, setCurrentView] = useState('home');
  const [username, setUsername] = useState(
    localStorage.getItem('username') || 'Steve'
  );
  const [elyAccount, setElyAccount] = useState<ElyAccount | null>(null);
  const [pendingKlPath, setPendingKlPath] = useState<string | null>(null);

  useEffect(() => {
    const savedAccount = localStorage.getItem('elyAccount');
    if (savedAccount) {
      try {
        const account = JSON.parse(savedAccount);
        setElyAccount(account);
        setUsername(account.username);
      } catch (e) {
        console.error('Failed to parse saved account:', e);
      }
    }
  }, []);

  useEffect(() => {
    // Лаунчер мог быть запущен двойным кликом по .kl файлу
    window.electronAPI?.klGetPending?.().then((p: string | null) => {
      if (p) {
        setPendingKlPath(p);
        setCurrentView('settings');
      }
    });
    window.electronAPI?.onKlPending?.((p: string) => {
      setPendingKlPath(p);
      setCurrentView('settings');
    });
  }, []);

  const handleUsernameChange = (val: string) => {
    setUsername(val);
    localStorage.setItem('username', val);
  };

  const handleElyAccountChange = (account: ElyAccount | null) => {
    setElyAccount(account);
    if (account) {
      setUsername(account.username);
      localStorage.setItem('elyAccount', JSON.stringify(account));
      localStorage.setItem('username', account.username);
    } else {
      localStorage.removeItem('elyAccount');
    }
  };

  return (
    <div className="app">
      <div className="app-navigation">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      </div>
      <div className="app-body">
        <Header
          currentView={currentView}
          username={username}
          onUsernameChange={handleUsernameChange}
          elyAccount={elyAccount}
        />
        <MainContent
          currentView={currentView}
          username={username}
          elyAccount={elyAccount}
          onElyAccountChange={handleElyAccountChange}
          pendingKlPath={pendingKlPath}
        />
      </div>
      <UpdateToast />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
