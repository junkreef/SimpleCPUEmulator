import { useState, useEffect, useRef } from 'react';
import { CPUExecutionState } from './emulator/types';
import { initCPUExecutionState, stepCPU, stepInstruction, translateAddress } from './emulator/cpu';
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

  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [addressToLineMap, setAddressToLineMap] = useState<Record<number, number>>({});

  const skipNextBreakpointRef = useRef(false);

  // アセンブル完了時のハンドラー
  const handleAssemble = (code: string) => {
    setCurrentCode(code);
    const result = assemble(code);
    if (result.success) {
      const newState = initCPUExecutionState(result.rom);
      setExecState(newState);
      setAddressToLineMap(result.addressToLineMap);
      setHasProgram(true);
      setIsAutoRunning(false);

      // ブレークポイントをクリーンアップ (無効な行数を除去)
      const maxLine = code.split('\n').length;
      setBreakpoints((prev) => {
        const next = new Set<number>();
        prev.forEach((ln) => {
          if (ln <= maxLine) next.add(ln);
        });
        return next;
      });

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

  // ブレークポイントのON/OFF切り替え
  const handleToggleBreakpoint = (line: number) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(line)) {
        next.delete(line);
      } else {
        next.add(line);
      }
      return next;
    });
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

        // --- ブレークポイント判定 ---
        // FETCHフェーズの開始時で、PCアドレスに対応する物理アドレスのアセンブリ行番号が breakpoints に含まれる場合
        if (prev.phase === 'FETCH') {
          const trans = translateAddress(prev.cpu, prev.cpu.pc);
          if (trans.success && trans.physicalAddr !== null) {
            const physAddr = trans.physicalAddr;
            const line = addressToLineMap[physAddr];

            if (line !== undefined && breakpoints.has(line)) {
              if (skipNextBreakpointRef.current) {
                // 一時停止からの再開(Resume)直後の場合は、現在のブレークポイントを1回だけスルーして進む
                skipNextBreakpointRef.current = false;
              } else {
                // 自動実行を一時停止し、状態は更新せずそのまま戻る
                setIsAutoRunning(false);
                return prev;
              }
            }
          }
        }

        // 実行を進めるので、スキップフラグをリセット
        skipNextBreakpointRef.current = false;
        return stepInstruction(prev); // 1命令実行
      });
    }, interval);

    return () => clearTimeout(timer);
  }, [isAutoRunning, speedHz, execState.cpu.pc, execState.cpu.halted, execState.cpu.ef, breakpoints, addressToLineMap]);

  // 現在実行中の命令が対応するアセンブリ行を特定
  const getCurrentLine = () => {
    if (execState.cpu.halted || execState.cpu.ef) return null;
    const trans = translateAddress(execState.cpu, execState.cpu.pc);
    if (trans.success && trans.physicalAddr !== null) {
      return addressToLineMap[trans.physicalAddr] || null;
    }
    return null;
  };
  const currentLine = getCurrentLine();

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
            breakpoints={breakpoints}
            onToggleBreakpoint={handleToggleBreakpoint}
            currentLine={currentLine}
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
                onToggleAuto={() => {
                  if (!isAutoRunning) {
                    skipNextBreakpointRef.current = true;
                  }
                  setIsAutoRunning(!isAutoRunning);
                }}
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
