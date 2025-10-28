import React, { useEffect } from 'react';
import { useAppStore, LogLevel } from '../store/useAppStore';

export const StatsPanel: React.FC = () => {
  const { stats, setStats, connected, addLog } = useAppStore();

  const refreshStats = async () => {
    if (!connected) return;

    try {
      const result = await window.lmsAPI.getStats();
      setStats(result);
    } catch (error) {
      addLog(LogLevel.Error, `Failed to get stats: ${error}`);
    }
  };

  useEffect(() => {
    if (!connected) return;
    
    refreshStats();
    const interval = setInterval(refreshStats, 3000);
    return () => clearInterval(interval);
  }, [connected]);

  if (!stats) {
    return (
      <section className="panel stats-panel">
        <h2 className="panel-title">Statistics</h2>
        <div className="empty-state">
          <p>{connected ? 'Loading statistics...' : 'Connect to view statistics'}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel stats-panel">
      <h2 className="panel-title">Statistics</h2>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Paired</span>
          <span className="stat-value">{stats.paired}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Discovered</span>
          <span className="stat-value">{stats.discovered}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Sent</span>
          <span className="stat-value">{stats.sent}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Received</span>
          <span className="stat-value">{stats.received}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Lost</span>
          <span className="stat-value lost">{stats.lost}</span>
        </div>
      </div>
    </section>
  );
};

