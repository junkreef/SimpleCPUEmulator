import { useState, useEffect } from 'react';
import { CPUExecutionState } from './emulator/types';
import { initCPUExecutionState, stepCPU, stepInstruction } from './emulator/cpu';
import { assemble } from './emulator/assembler';
import { CodeEditor } from './components/CodeEditor';
import { ControlPanel } from './components/ControlPanel';
import { InstructionExplainer } from './components/InstructionExplainer';
import { CPUVisualizer } from './components/CPUVisualizer';

function App() {
  const [execState, setExecState] = useState<CPUExecutionState>(() => initCPUExecutionState());
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [speedHz, setSpeedHz] = useState(2); // 実行速度 (デフォルト2Hz)
  const [hasProgram, setHasProgram] = useState(false);
  const [currentCode, setCurrentCode] = useState('');

  // アセンブル完了時のハンドラー
  const handleAssemble = (code: string) => {
    setCurrentCode(code);
    const result = assemble(code);
    if (result.success) {
      const newState = initCPUExecutionState(result.rom);
      setExecState(newState);
      setHasProgram(true);
      setIsAutoRunning(false);
      return { success: true, errors: [] };
    } else {
      setHasProgram(false);
      setIsAutoRunning(false);
      return { success: false, errors: result.errors };
    }
  };

  // 1フェーズ(ステップ)進む
  const handleStepCPU = () => {
    setExecState((prev) => stepCPU(prev));
  };

  // 1命令分進む
  const handleStepInstruction = () => {
    setExecState((prev) => stepInstruction(prev));
  };

  // リセット
  const handleReset = () => {
    setIsAutoRunning(false);
    if (currentCode) {
      handleAssemble(currentCode);
    } else {
      setExecState(initCPUExecutionState());
      setHasProgram(false);
    }
  };

  // 自動実行の管理 (useEffect と setTimeout による再帰タイマー)
  useEffect(() => {
    if (!isAutoRunning) return;

    // CPUが停止またはエラーなら終了
    if (execState.cpu.halted || execState.cpu.ef) {
      setIsAutoRunning(false);
      return;
    }

    const interval = 1000 / speedHz;
    const timer = setTimeout(() => {
      setExecState((prev) => {
        if (prev.cpu.halted || prev.cpu.ef) {
          setIsAutoRunning(false);
          return prev;
        }
        return stepInstruction(prev); // 1命令実行
      });
    }, interval);

    return () => clearTimeout(timer);
  }, [isAutoRunning, speedHz, execState.cpu.pc, execState.cpu.halted, execState.cpu.ef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-main)', overflow: 'hidden' }}>
      {/* 🔮 ヘッダーバー */}
      <header
        style={{
          height: '56px',
          background: 'rgba(10, 18, 36, 0.8)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 20px',
          backdropFilter: 'blur(8px)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 10px rgba(0, 210, 255, 0.5)',
            }}
          >
            <span style={{ fontWeight: 900, color: 'var(--bg-main)', fontSize: '0.85rem', fontFamily: 'var(--font-digital)' }}>CPU</span>
          </div>
          <h1
            style={{
              fontSize: '1.1rem',
              fontWeight: 900,
              fontFamily: 'var(--font-digital)',
              letterSpacing: '1.5px',
              background: 'linear-gradient(to right, #00d2ff, #ff007f)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 20px rgba(0, 210, 255, 0.2)',
            }}
          >
            CYBERPUNK CPU & DAT SIMULATOR
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          <span>ARCHITECTURE: <strong className="glow-text-cyan">8-BIT DATA / DAT MMU</strong></span>
          <span
            style={{
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
              paddingLeft: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              minWidth: '180px', // 幅をしっかり固定して凸凹を防ぐ
            }}
          >
            STATUS:&nbsp;
            <strong style={{ color: execState.cpu.ef ? 'var(--color-secondary)' : execState.cpu.halted ? 'var(--color-success)' : 'var(--color-primary)' }}>
              {execState.cpu.ef ? 'EXCEPTION FAULT' : execState.cpu.halted ? 'HALTED' : 'RUNNING'}
            </strong>
          </span>
        </div>
      </header>

      {/* 🚀 メインコンテンツダッシュボード */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          gap: '16px',
          padding: '16px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* 左側：コードエディタ (Width: 35%) */}
        <section style={{ width: '35%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CodeEditor
            onAssemble={handleAssemble}
            isCpuRunning={isAutoRunning}
          />
        </section>

        {/* 右側：ビジュアライザ、メモリ、制御、解説 (Width: 65%) */}
        <section
          style={{
            width: '65%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* 上段：制御パネル ＆ 解説パネル */}
          <div style={{ display: 'flex', gap: '16px', flexShrink: 0, alignItems: 'stretch', height: '260px' }}>
            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column' }}>
              <ControlPanel
                execState={execState}
                onStepCPU={handleStepCPU}
                onStepInstruction={handleStepInstruction}
                onReset={handleReset}
                onToggleAuto={() => setIsAutoRunning(!isAutoRunning)}
                isAutoRunning={isAutoRunning}
                speedHz={speedHz}
                onChangeSpeed={setSpeedHz}
                hasProgram={hasProgram}
              />
            </div>
            <div style={{ flex: 1.8, display: 'flex', flexDirection: 'column' }}>
              <InstructionExplainer execState={execState} />
            </div>
          </div>

          {/* 下段：CPU & RAM 一体型データパスビジュアライザ */}
          <div style={{ flex: 1, minHeight: '420px', height: '100%' }}>
            <CPUVisualizer execState={execState} />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
