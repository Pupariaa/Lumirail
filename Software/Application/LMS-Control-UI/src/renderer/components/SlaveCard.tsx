import React, { useState } from 'react';
import { Slave } from '../../shared/types';
import { useAppStore, LogLevel } from '../store/useAppStore';

interface SlaveCardProps {
  slave: Slave;
}

export const SlaveCard: React.FC<SlaveCardProps> = ({ slave }) => {
  const { addLog, selectedSlaveId, setSelectedSlaveId } = useAppStore();
  const [loading, setLoading] = useState(false);
  const isSelected = selectedSlaveId === slave.id;

  const handlePair = async () => {
    setLoading(true);
    try {
      const result = await window.lmsAPI.pairSlave(slave.id);
      if (result.success) {
        addLog(LogLevel.Success, `Paired with slave ${slave.id}`);
      }
    } catch (error) {
      addLog(LogLevel.Error, `Pair failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUnpair = async () => {
    setLoading(true);
    try {
      const result = await window.lmsAPI.unpairSlave(slave.id);
      if (result.success) {
        addLog(LogLevel.Info, `Unpaired slave ${slave.id}`);
      }
    } catch (error) {
      addLog(LogLevel.Error, `Unpair failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePing = async () => {
    setLoading(true);
    try {
      const result = await window.lmsAPI.pingSlave(slave.id);
      if (result.success) {
        addLog(LogLevel.Success, `Ping slave ${slave.id}: ${result.rtt_ms}ms`);
      }
    } catch (error) {
      addLog(LogLevel.Error, `Ping failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`slave-card ${slave.paired ? 'paired' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => setSelectedSlaveId(isSelected ? null : slave.id)}
    >
      <div className="slave-header">
        <h3 className="slave-id">Slave #{slave.id}</h3>
        {slave.paired && <span className="slave-badge">Paired</span>}
      </div>
      <div className="slave-info">
        <div className="slave-info-row">
          <span className="slave-label">MAC:</span>
          <span className="slave-value">{slave.mac}</span>
        </div>
        <div className="slave-info-row">
          <span className="slave-label">RSSI:</span>
          <span className="slave-value">{slave.rssi} dBm</span>
        </div>
        <div className="slave-info-row">
          <span className="slave-label">State:</span>
          <span className="slave-value">{getStateLabel(slave.state)}</span>
        </div>
      </div>
      <div className="slave-actions">
        {!slave.paired ? (
          <button onClick={handlePair} disabled={loading} className="button small primary">
            Pair
          </button>
        ) : (
          <button onClick={handleUnpair} disabled={loading} className="button small secondary">
            Unpair
          </button>
        )}
        <button onClick={handlePing} disabled={loading} className="button small">
          Ping
        </button>
      </div>
    </div>
  );
};

function getStateLabel(state: number): string {
  switch (state) {
    case 0:
      return 'Unpaired';
    case 1:
      return 'Discovered';
    case 2:
      return 'Paired';
    case 3:
      return 'Lost';
    default:
      return 'Unknown';
  }
}

