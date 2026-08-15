import React, { useState, useEffect } from 'react';
import HomeView from './views/HomeView';
import ModsView from './views/ModsView';
import BrowseView from './views/BrowseView';
import SettingsView from './views/SettingsView';
import './MainContent.css';

interface ElyAccount {
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}

interface MainContentProps {
  currentView: string;
  username: string;
  elyAccount: ElyAccount | null;
  onElyAccountChange: (account: ElyAccount | null) => void;
}

function MainContent({ currentView, username, elyAccount, onElyAccountChange }: MainContentProps) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayedView, setDisplayedView] = useState(currentView);

  useEffect(() => {
    if (currentView !== displayedView) {
      setIsTransitioning(true);
      
      // Ждём окончания fade-out анимации
      setTimeout(() => {
        setDisplayedView(currentView);
        setIsTransitioning(false);
      }, 150); // Половина времени анимации
    }
  }, [currentView, displayedView]);

  const renderView = () => {
    switch (displayedView) {
      case 'home':
        return <HomeView username={username} elyAccount={elyAccount} />;
      case 'mods':
        return <ModsView />;
      case 'browse':
        return <BrowseView />;
      case 'settings':
        return <SettingsView elyAccount={elyAccount} onElyAccountChange={onElyAccountChange} />;
      default:
        return <HomeView username={username} elyAccount={elyAccount} />;
    }
  };

  return (
    <div className={`main-content ${isTransitioning ? 'transitioning' : ''}`}>
      {renderView()}
    </div>
  );
}

export default MainContent;
