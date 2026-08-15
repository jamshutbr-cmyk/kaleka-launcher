import React from 'react';
import './Sidebar.css';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const menuItems = [
    { id: 'home', icon: 'e' },
    { id: 'mods', icon: 'P' },
    { id: 'browse', icon: 'A' },
    { id: 'settings', icon: 'F' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo icon-font">H</div>
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`sidebar-item icon-font ${currentView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            {item.icon}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Sidebar;
