import React, { useState } from 'react';
import { useAppStore, LogLevel } from '../store/useAppStore';

export const ConnectionPanel: React.FC = () => {
  const { connected, port, setConnected, setPort, addLog } = useAppStore();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await window.lmsAPI.connect(port);
      if (result.success) {
        setConnected(true);
        addLog(LogLevel.Success, `Connected to ${port}`);
      } else {
        addLog(LogLevel.Error, result.message || 'Connection failed');
      }
    } catch (error) {
      addLog(LogLevel.Error, `Connection error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await window.lmsAPI.disconnect();
      setConnected(false);
      addLog(LogLevel.Info, 'Disconnected');
    } catch (error) {
      addLog(LogLevel.Error, `Disconnect error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel connection-panel">
      <h2 className="panel-title">Connection</h2>
      <div className="connection-controls">
        <input
          type="text"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="COM3"
          disabled={connected || loading}
          className="input"
        />
        {!connected ? (
          <button onClick={handleConnect} disabled={loading} className="button primary">
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        ) : (
          <button onClick={handleDisconnect} disabled={loading} className="button secondary">
            Disconnect
          </button>
        )}
      </div>
    </section>
  );
};

