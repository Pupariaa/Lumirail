import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export const Header: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const connected = useAppStore((state) => state.connected);

  useEffect(() => {
    window.lmsAPI.getVersion().then(setVersion);
  }, []);

  useEffect(() => {
    if (connected) {
      // Fetch connected model info (for now hardcoded, will be from API later)
      setModel('LMS-S1-G2');
    } else {
      setModel('');
    }
  }, [connected]);

  return (
    <header className="header">
      <div className="header-title">
        <h1>Lumirail Studio</h1>
        <span className="header-version">v{version}</span>
        {model && <span className="header-model">{model}</span>}
      </div>
      <div className="header-status">
        <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} />
        <span className="status-text">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </header>
  );
};

