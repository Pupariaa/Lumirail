import React, { useEffect } from 'react';
import { useAppStore, LogLevel } from '../store/useAppStore';
import { SlaveCard } from './SlaveCard';

export const SlavesPanel: React.FC = () => {
  const { slaves, setSlaves, connected, addLog } = useAppStore();

  const refreshSlaves = async () => {
    if (!connected) {
      addLog(LogLevel.Warning, 'Not connected');
      return;
    }

    try {
      const result = await window.lmsAPI.getSlaves();
      setSlaves(result.slaves);
      addLog(LogLevel.Info, `Found ${result.count} slave(s)`);
    } catch (error) {
      addLog(LogLevel.Error, `Failed to list slaves: ${error}`);
    }
  };

  useEffect(() => {
    if (connected) {
      refreshSlaves();
      const interval = setInterval(refreshSlaves, 5000);
      return () => clearInterval(interval);
    }
  }, [connected]);

  return (
    <section className="panel slaves-panel">
      <div className="panel-header">
        <h2 className="panel-title">Discovered Slaves ({slaves.length})</h2>
        <button onClick={refreshSlaves} disabled={!connected} className="button small">
          Refresh
        </button>
      </div>
      <div className="slaves-grid">
        {slaves.length === 0 ? (
          <div className="empty-state">
            <p>No slaves discovered</p>
            <p className="empty-state-hint">
              {connected ? 'Waiting for slaves...' : 'Connect to see slaves'}
            </p>
          </div>
        ) : (
          slaves.map((slave) => <SlaveCard key={slave.id} slave={slave} />)
        )}
      </div>
    </section>
  );
};

