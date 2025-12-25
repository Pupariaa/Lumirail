import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { Timeline } from './components/Timeline';
import { Sidebar } from './components/Sidebar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { LEDPreview } from './components/LEDPreview';
import { useSimulationStore } from './store/useSimulationStore';
import './styles/App.css';

export const App: React.FC = () => {
  const initialize = useSimulationStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <div className="app-layout">
          <div className="app-left-panel">
            <Sidebar />
            <PropertiesPanel />
          </div>
          <div className="app-center-panel">
            <Timeline />
          </div>
          <div className="app-right-panel">
            <LEDPreview />
          </div>
        </div>
      </main>
    </div>
  );
};

