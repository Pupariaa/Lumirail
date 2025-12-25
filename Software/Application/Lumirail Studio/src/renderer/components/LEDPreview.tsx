import React, { useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';

export const LEDPreview: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentFrame = useSimulationStore((state) => state.currentFrame);
  const hardwareModel = useSimulationStore((state) => state.hardwareModel);
  const maxLEDs = useSimulationStore((state) => state.maxLEDs);
  const node = hardwareModel.getNode();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ledFrame = currentFrame.ledFrame;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const moduleCount = node.modules.length;
    const moduleHeight = canvasHeight / moduleCount;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    node.modules.forEach((module, moduleIdx) => {
      const y = moduleIdx * moduleHeight;
      const ledWidth = canvasWidth / module.channelCount;

      for (let i = 0; i < module.channelCount; i++) {
        const ledId = module.ledStartIndex + i;
        if (ledId >= ledFrame.length) continue;

        const value = ledFrame[ledId];
        const x = i * ledWidth;

        const r = value;
        const g = value;
        const b = value;

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, Math.ceil(ledWidth), moduleHeight - 2);
      }

      if (moduleIdx < moduleCount - 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + moduleHeight);
        ctx.lineTo(canvasWidth, y + moduleHeight);
        ctx.stroke();
      }
    });
  }, [currentFrame, maxLEDs, node]);

  const formatSimulationTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="led-preview">
      <div className="led-preview-header">
        <h3 className="panel-title">LED Preview</h3>
        <span>{node.name} ({node.modules.length} modules, {maxLEDs} channels)</span>
        <span className={node.connected ? 'status-connected' : 'status-disconnected'}>
          {node.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="led-preview-container">
        <canvas
          ref={canvasRef}
          width={800}
          height={100}
          className="led-preview-canvas"
        />
        <div className="led-preview-modules-info">
          {node.modules.map((module) => (
            <div key={module.id} className="led-preview-module-info">
              <span>LMS-S1-G2 #{module.moduleIndex} (LEDs {module.ledStartIndex}-{module.ledStartIndex + module.channelCount - 1})</span>
              <span className={module.connected ? 'status-connected' : 'status-disconnected'}>
                {module.connected ? 'OK' : 'OFF'}
              </span>
            </div>
          ))}
        </div>
        {currentFrame && (
          <div className="led-preview-info">
            <span>Time: {currentFrame.timestamp.toFixed(2)}s</span>
            <span>Sim: {formatSimulationTime(currentFrame.simulationTime)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

