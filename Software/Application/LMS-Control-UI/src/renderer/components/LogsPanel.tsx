import React, { useRef, useEffect } from 'react';
import { useAppStore, LogLevel } from '../store/useAppStore';

export const LogsPanel: React.FC = () => {
  const { logs, clearLogs } = useAppStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <section className="panel logs-panel">
      <div className="panel-header">
        <h2 className="panel-title">Logs ({logs.length})</h2>
        <button onClick={clearLogs} className="button small secondary">
          Clear
        </button>
      </div>
      <div className="logs-container">
        {logs.length === 0 ? (
          <div className="empty-state">
            <p>No logs yet</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`log-entry log-${log.level}`}>
              <span className="log-time">{formatTime(log.timestamp)}</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </section>
  );
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

