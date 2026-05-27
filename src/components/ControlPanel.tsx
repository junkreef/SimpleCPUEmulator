import React from 'react';
import { CPUExecutionState } from '../emulator/types';

interface ControlPanelProps {
  execState: CPUExecutionState;
  onStepCPU: () => void;
  onStepInstruction: () => void;
  onReset: () => void;
  onToggleAuto: () => void;
  isAutoRunning: boolean;
  speedHz: number;
  onChangeSpeed: (speed: number) => void;
  hasProgram: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  execState,
  onStepCPU,
  onStepInstruction,
  onReset,
  onToggleAuto,
  isAutoRunning,
  speedHz,
  onChangeSpeed,
  hasProgram,
}) => {
  const { cpu, phase, decoded } = execState;

  // 現在の状態表示用のテキスト・クラス
  let statusText = 'スタンバイ';
  let statusClass = 'glow-text-cyan';

  if (cpu.ef) {
    statusText = '🛑 DAT EXCEPTION FAULT (エラー停止)';
    statusClass = 'glow-text-pink animate-blink';
  } else if (cpu.halted) {
    statusText = '🏁 HALT (実行完了)';
    statusClass = 'glow-text-green';
  } else if (isAutoRunning) {
    statusText = '⚡ 実行中 (AUTO)';
    statusClass = 'glow-text-success animate-blink';
  } else if (phase !== 'FETCH' || decoded) {
    statusText = `⏸️ 一時停止中 (${phase})`;
    statusClass = 'glow-text-amber';
  }

  return (
    <div className="cyber-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          CLOCK & RUN CONTROLLER
        </h3>
        <div 
          style={{ 
            fontSize: '0.85rem', 
            fontWeight: 500,
            minWidth: '180px',
            textAlign: 'right',
            display: 'inline-block'
          }} 
          className={statusClass}
        >
          {statusText}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {/* 自動実行トグル */}
        <button
          className={`cyber-button ${isAutoRunning ? 'secondary' : 'success'}`}
          onClick={onToggleAuto}
          disabled={!hasProgram || cpu.halted || cpu.ef}
          style={{ flex: '1 1 120px' }}
        >
          {isAutoRunning ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              一時停止
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              自動実行
            </>
          )}
        </button>

        {/* 1フェーズ(ステップ)実行 */}
        <button
          className="cyber-button"
          onClick={onStepCPU}
          disabled={isAutoRunning || !hasProgram || cpu.halted || cpu.ef}
          style={{ flex: '1 1 120px' }}
          title="Fetch -> Decode -> Execute を一歩ずつ実行します"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
          1フェーズ進む
        </button>

        {/* 1命令実行 */}
        <button
          className="cyber-button"
          onClick={onStepInstruction}
          disabled={isAutoRunning || !hasProgram || cpu.halted || cpu.ef}
          style={{ flex: '1 1 120px' }}
          title="1命令分（FetchからExecuteまで）を一気に実行します"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>
          1命令実行
        </button>

        {/* リセット */}
        <button
          className="cyber-button secondary"
          onClick={onReset}
          style={{ flex: '1 1 80px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          リセット
        </button>
      </div>

      {/* スピードスライダー */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          <span>クロック周波数 (実行速度):</span>
          <span className="digital-display glow-text-cyan">{speedHz.toFixed(1)} Hz</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={speedHz}
            onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
            disabled={isAutoRunning}
            style={{
              flex: 1,
              accentColor: 'var(--color-primary)',
              background: 'rgba(0, 210, 255, 0.1)',
              height: '6px',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          />
        </div>
      </div>
    </div>
  );
};
