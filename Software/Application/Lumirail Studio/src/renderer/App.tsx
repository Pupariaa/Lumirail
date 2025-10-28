import React from 'react';
import { Header } from './components/Header';
import { ConnectionPanel } from './components/ConnectionPanel';
import { SlavesPanel } from './components/SlavesPanel';
import { StatsPanel } from './components/StatsPanel';
import { LogsPanel } from './components/LogsPanel';
import './styles/App.css';

export const App: React.FC = () => {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <div className="app-grid">
          <ConnectionPanel />
          <SlavesPanel />
          <StatsPanel />
          <LogsPanel />
        </div>
      </main>
    </div>
  );
};

