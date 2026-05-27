import React from 'react';
import { CPUExecutionState } from '../emulator/types';
import { translateAddress } from '../emulator/cpu';

interface CPUVisualizerProps {
  execState: CPUExecutionState;
}

// ページごとのネオンカラー
const PAGE_COLORS = [
  '#00d2ff', // ページ0: ネオンブルー
  '#ff007f', // ページ1: サイバーピンク
  '#00ffaa', // ページ2: エメラルドグリーン
  '#ffaa00', // ページ3: アンバーイエロー
];

export const CPUVisualizer: React.FC<CPUVisualizerProps> = ({ execState }) => {
  const {
    cpu,
    phase,
    decoded,
    addressTranslationLog,
    lastAccessedRamAddr,
    lastWriteRamAddr,
    fetchBuffer,
  } = execState;

  // レジスタ表示用数値
  const r0 = cpu.registers[0];
  const r1 = cpu.registers[1];
  const r2 = cpu.registers[2];
  const r3 = cpu.registers[3];

  // 16進数フォーマットヘルパー
  const toHex = (val: number, len: number = 2) => {
    return val.toString(16).toUpperCase().padStart(len, '0');
  };

  // 各フェーズごとのアクティブフラグ
  const isFetch = phase === 'FETCH';
  const isDecode = phase === 'DECODE';
  const isExecute = phase === 'EXECUTE';

  // 命令の種別判定
  const isMathOp = decoded && ['ADD', 'SUB'].includes(decoded.mnemonic);
  const isCmpOp = decoded && decoded.mnemonic === 'CMP';
  const isDatOp = decoded && ['DATSET', 'DATCLR', 'DATEN', 'DATDIS'].includes(decoded.mnemonic);
  const isLoadImm = decoded && decoded.mnemonic === 'LOAD' && !decoded.operandText.includes('['); // 即値ロード
  const isLoadAddr = decoded && decoded.mnemonic === 'LOAD' && decoded.operandText.includes('[0x'); // メモリ直接ロード
  const isLoadInd = decoded && decoded.mnemonic === 'LOAD' && decoded.operandText.includes('[R'); // レジスタ間接ロード

  const isStoreAddr = decoded && decoded.mnemonic === 'STORE' && decoded.operandText.startsWith('[0x'); // メモリ直接ストア
  const isStoreInd = decoded && decoded.mnemonic === 'STORE' && decoded.operandText.startsWith('[R'); // レジスタ間接ストア

  // メモリアクセス（アドレス・データバス）が発生するかどうか
  const hasMemAccess = isExecute && (isLoadAddr || isLoadInd || isStoreAddr || isStoreInd);

  // どの物理フレームがどの仮想ページにマッピングされているかを逆引きする
  const getFrameMapping = (frameIdx: number): { pageIdx: number; valid: boolean } | null => {
    if (cpu.datr === 0) return null; // DAT無効時はマッピング非表示
    for (let p = 0; p < 4; p++) {
      const entry = cpu.datTable[p];
      if (entry.valid && entry.pfn === frameIdx) {
        return { pageIdx: p, valid: true };
      }
    }
    return null;
  };

  // PCに対応する物理アドレスの算出
  const pcTrans = translateAddress(cpu, cpu.pc);
  const pcPhys = pcTrans.success ? pcTrans.physicalAddr : null;

  // 現在デコードまたはフェッチ中の命令のバイト数
  const currentInstBytes = decoded ? decoded.bytes : (fetchBuffer.length > 0 ? fetchBuffer.length : 1);

  return (
    <div className="cyber-panel" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        CPU & RAM INTEGRATED DATAPATH VISUALIZER
      </h3>

      <div style={{ flex: 1, position: 'relative', background: '#02050b', borderRadius: '8px', border: '1px solid rgba(0, 210, 255, 0.05)', overflow: 'hidden' }}>
        <svg
          viewBox="0 0 820 440"
          width="100%"
          height="100%"
          style={{ display: 'block' }}
        >
          {/* 定義セクション (グラデーションとぼかしシャドウ) */}
          <defs>
            <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0d1f3d" />
              <stop offset="100%" stopColor="#050b14" />
            </linearGradient>
            <linearGradient id="neonCyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00d2ff" />
              <stop offset="100%" stopColor="#0066aa" />
            </linearGradient>
            <filter id="glowCyan" filterUnits="userSpaceOnUse" x="-50" y="-50" width="920" height="540">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glowPink" filterUnits="userSpaceOnUse" x="-50" y="-50" width="920" height="540">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glowGreen" filterUnits="userSpaceOnUse" x="-50" y="-50" width="920" height="540">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glowWarning" filterUnits="userSpaceOnUse" x="-50" y="-50" width="920" height="540">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* ========================================================================= */}
          {/* 1. バックグラウンド配線・パス (Data Paths) */}
          {/* ========================================================================= */}

          {/* 共通データバス (DATA BUS) - RAMの上から左へ伸びて IR / Registers / ALU に繋がる1本の太いバス */}
          {/* 主の縦の幹 (Y=15 から Y=295 まで) */}
          <path d="M 580 15 L 12 15 L 12 295" fill="none" stroke="rgba(255, 0, 127, 0.1)" strokeWidth="3" />
          {/* IRへの接続線 (隙間を開けるため X=12 から X=25 へ接続) */}
          <path d="M 12 217 L 25 217" fill="none" stroke="rgba(255, 0, 127, 0.1)" strokeWidth="3" />
          {/* 各レジスタへの分岐線 */}
          <path d="M 12 41 L 140 41" fill="none" stroke="rgba(255, 0, 127, 0.1)" strokeWidth="2" />
          <path d="M 12 71 L 140 71" fill="none" stroke="rgba(255, 0, 127, 0.1)" strokeWidth="2" />
          <path d="M 12 101 L 140 101" fill="none" stroke="rgba(255, 0, 127, 0.1)" strokeWidth="2" />
          <path d="M 12 131 L 140 131" fill="none" stroke="rgba(255, 0, 127, 0.1)" strokeWidth="2" />

          {/* FETCH時: RAM ➔ DATA BUS ➔ IR (命令フェッチ) */}
          {isFetch && (
            <path d="M 580 15 L 12 15 L 12 217 L 25 217" fill="none" stroke="var(--color-secondary)" strokeWidth="3" className="animate-dash-flow" />
          )}

          {/* EXECUTE メモリロード時 (LOAD Rd, [addr] / LOAD Rd, [Ra]): RAM ➔ DATA BUS ➔ 指定レジスタ */}
          {isExecute && (isLoadAddr || isLoadInd) && decoded && (
            <>
              {/* R0がロード先の場合: Y=41まで下りてR0へ */}
              {decoded.operands[0] === 0 && (
                <>
                  <path d="M 580 15 L 12 15 L 12 41" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 41 L 140 41" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
              {/* R1がロード先の場合: Y=71まで下りてR1へ */}
              {decoded.operands[0] === 1 && (
                <>
                  <path d="M 580 15 L 12 15 L 12 71" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 71 L 140 71" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
              {/* R2がロード先の場合: Y=101まで下りてR2へ */}
              {decoded.operands[0] === 2 && (
                <>
                  <path d="M 580 15 L 12 15 L 12 101" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 101 L 140 101" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
              {/* R3がロード先の場合: Y=131まで下りてR3へ */}
              {decoded.operands[0] === 3 && (
                <>
                  <path d="M 580 15 L 12 15 L 12 131" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 131 L 140 131" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
            </>
          )}

          {/* EXECUTE メモリストア時 (STORE [addr], Rs / STORE [Ra], Rs): 指定レジスタ ➔ DATA BUS ➔ RAM */}
          {isExecute && (isStoreAddr || isStoreInd) && (
            <>
              <path d="M 12 15 L 580 15" fill="none" stroke="var(--color-secondary)" strokeWidth="3" className="animate-dash-flow" />
              {/* アクティブな読み出し元レジスタ (Rs) の分岐のみ光らせる */}
              {decoded && decoded.operandText.endsWith('R0') && <path d="M 140 41 L 12 41 L 12 15" fill="none" stroke="var(--color-secondary)" strokeWidth="2" className="animate-dash-flow" />}
              {decoded && decoded.operandText.endsWith('R1') && <path d="M 140 71 L 12 71 L 12 15" fill="none" stroke="var(--color-secondary)" strokeWidth="2" className="animate-dash-flow" />}
              {decoded && decoded.operandText.endsWith('R2') && <path d="M 140 101 L 12 101 L 12 15" fill="none" stroke="var(--color-secondary)" strokeWidth="2" className="animate-dash-flow" />}
              {decoded && decoded.operandText.endsWith('R3') && <path d="M 140 131 L 12 131 L 12 15" fill="none" stroke="var(--color-secondary)" strokeWidth="2" className="animate-dash-flow" />}
            </>
          )}

          {/* IR ➔ Decoder */}
          <path d="M 111 217 L 130 217" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="2" />
          {isDecode && (
            <path d="M 111 217 L 130 217" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="animate-dash-flow" />
          )}

          {/* Decoder ➔ MUX 1 (レジスタ選択の制御信号) */}
          <path d="M 175 200 L 175 160 L 230 160 L 230 135" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="1.5" />
          {isExecute && (
            <path d="M 175 200 L 175 160 L 230 160 L 230 135" fill="none" stroke="var(--color-warning)" strokeWidth="1.5" className="animate-dash-flow" />
          )}

          {/* Decoder ➔ ALU (制御信号) */}
          <path d="M 175 235 L 175 272 L 220 272" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="1.5" />
          {isExecute && (isMathOp || isCmpOp) && (
            <path d="M 175 235 L 175 272 L 220 272" fill="none" stroke="var(--color-warning)" strokeWidth="1.5" className="animate-dash-flow" />
          )}

          {/* Decoder ➔ MUX 2 (即値データ / 直接アドレス値の転送) */}
          <path d="M 220 217 L 340 217" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="1.5" />
          {isExecute && (isLoadImm || isLoadAddr || isStoreAddr || isDatOp) && (
            <path d="M 220 217 L 340 217" fill="none" stroke="var(--color-success)" strokeWidth="1.5" className="animate-dash-flow" />
          )}

          {/* 各レジスタ ➔ MUX 1 */}
          <path d="M 190 41 L 220 41" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="2" />
          <path d="M 190 71 L 220 71" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="2" />
          <path d="M 190 101 L 220 101" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="2" />
          <path d="M 190 131 L 220 131" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="2" />
          {isExecute && (
            <>
              {/* R0のアクティブ判定 */}
              {/* 1. 演算・比較のオペランドにR0が含まれる (Primary 青) */}
              {(isMathOp || isCmpOp) && decoded && decoded.operandText.includes('R0') && <path d="M 190 41 L 220 41" fill="none" stroke="var(--color-primary)" strokeWidth="2" className="animate-dash-flow" />}
              {/* 2. レジスタ間接 [R0] としてアドレス指示として使われる (Warning 黄) */}
              {decoded && (
                (isStoreInd && decoded.operands[0] === 0) ||
                (isLoadInd && decoded.operands[1] === 0)
              ) && <path d="M 190 41 L 220 41" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="animate-dash-flow" filter="url(#glowWarning)" />}

              {/* R1のアクティブ判定 */}
              {(isMathOp || isCmpOp) && decoded && decoded.operandText.includes('R1') && <path d="M 190 71 L 220 71" fill="none" stroke="var(--color-primary)" strokeWidth="2" className="animate-dash-flow" />}
              {decoded && (
                (isStoreInd && decoded.operands[0] === 1) ||
                (isLoadInd && decoded.operands[1] === 1)
              ) && <path d="M 190 71 L 220 71" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="animate-dash-flow" filter="url(#glowWarning)" />}

              {/* R2のアフティブ判定 */}
              {(isMathOp || isCmpOp) && decoded && decoded.operandText.includes('R2') && <path d="M 190 101 L 220 101" fill="none" stroke="var(--color-primary)" strokeWidth="2" className="animate-dash-flow" />}
              {decoded && (
                (isStoreInd && decoded.operands[0] === 2) ||
                (isLoadInd && decoded.operands[1] === 2)
              ) && <path d="M 190 101 L 220 101" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="animate-dash-flow" filter="url(#glowWarning)" />}

              {/* R3のアクティブ判定 */}
              {(isMathOp || isCmpOp) && decoded && decoded.operandText.includes('R3') && <path d="M 190 131 L 220 131" fill="none" stroke="var(--color-primary)" strokeWidth="2" className="animate-dash-flow" />}
              {decoded && (
                (isStoreInd && decoded.operands[0] === 3) ||
                (isLoadInd && decoded.operands[1] === 3)
              ) && <path d="M 190 131 L 220 131" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="animate-dash-flow" filter="url(#glowWarning)" />}
            </>
          )}

          {/* MUX 1 ➔ ALU (入力1) */}
          <path d="M 240 85 L 270 85 L 270 255" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="2" />
          {isExecute && (isMathOp || isCmpOp) && (
            <path d="M 240 85 L 270 85 L 270 255" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
          )}

          {/* MUX 1 ➔ MUX 2 (データアドレス線、レジスタ間接アドレス転送) */}
          <path d="M 240 85 L 290 85 L 290 160 L 340 160" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="2" />
          {isExecute && (isLoadInd || isStoreInd) && (
            <path d="M 240 85 L 290 85 L 290 160 L 340 160" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="animate-dash-flow" filter="url(#glowWarning)" />
          )}

          {/* ALU ➔ MUX 2 (演算結果アドレス用) */}
          <path d="M 270 295 L 270 330 L 320 330 L 320 240 L 340 240" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="2" />

          {/* ALU ➔ 共通データバス (X=12) の結果書き戻し線 */}
          <path d="M 270 295 L 12 295" fill="none" stroke="rgba(0, 210, 255, 0.1)" strokeWidth="2" />
          {/* EXECUTE 演算命令結果書き戻し時 (ADD/SUB): ALU ➔ 共通データバス ➔ 指定レジスタ */}
          {isExecute && isMathOp && decoded && (
            <>
              {/* ALUから共通バスへの水平パルス */}
              <path d="M 270 295 L 12 295" fill="none" stroke="var(--color-success)" strokeWidth="2.5" className="animate-dash-flow" />
              
              {/* R0が書き戻し先の場合: X=12の縦幹をY=41まで上り、R0へ */}
              {decoded.operands[0] === 0 && (
                <>
                  <path d="M 12 295 L 12 41" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 41 L 140 41" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
              {/* R1が書き戻し先の場合: X=12の縦幹をY=71まで上り、R1へ */}
              {decoded.operands[0] === 1 && (
                <>
                  <path d="M 12 295 L 12 71" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 71 L 140 71" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
              {/* R2が書き戻し先の場合: X=12の縦幹をY=101まで上り、R2へ */}
              {decoded.operands[0] === 2 && (
                <>
                  <path d="M 12 295 L 12 101" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 101 L 140 101" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
              {/* R3が書き戻し先の場合: X=12の縦幹をY=131まで上り、R3へ */}
              {decoded.operands[0] === 3 && (
                <>
                  <path d="M 12 295 L 12 131" fill="none" stroke="var(--color-success)" strokeWidth="3" className="animate-dash-flow" />
                  <path d="M 12 131 L 140 131" fill="none" stroke="var(--color-success)" strokeWidth="2" className="animate-dash-flow" />
                </>
              )}
            </>
          )}

          {/* PC ➔ MUX 2 (命令フェッチアドレス線) */}
          <path d="M 200 325 L 310 325 L 310 240 L 340 240" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="2.5" />
          {isFetch && (
            <path d="M 200 325 L 310 325 L 310 240 L 340 240" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" className="animate-dash-flow" />
          )}

          {/* Phase ➔ MUX 2 (アドレス選択制御信号) */}
          <path d="M 200 375 L 350 375 L 350 255" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="1.5" />
          <path d="M 200 375 L 350 375 L 350 255" fill="none" stroke="var(--color-warning)" strokeWidth="1.5" className="animate-dash-flow" />

          {/* MUX 2 ➔ DAT Table */}
          <path d="M 360 200 L 400 200" fill="none" stroke="rgba(0, 210, 255, 0.15)" strokeWidth="2.5" />
          {(isFetch || hasMemAccess) && (
            <path d="M 360 200 L 400 200" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" className="animate-dash-flow" />
          )}

          {/* ========================================== */}
          {/* ADDRESS BUS (アドレスバス) - 下部からRAMへ */}
          {/* ========================================== */}
          <path d="M 510 205 L 580 205" fill="none" stroke="rgba(0, 210, 255, 0.2)" strokeWidth="4" />
          {/* FETCH時: 青いアドレスパルス */}
          {isFetch && (
            <path d="M 510 205 L 580 205" fill="none" stroke="var(--color-primary)" strokeWidth="4" className="animate-dash-flow" filter="url(#glowCyan)" />
          )}
          {/* EXECUTE時(メモリアクセス発生時): 黄色い物理アドレスパルス */}
          {hasMemAccess && addressTranslationLog?.success && (
            <path d="M 510 205 L 580 205" fill="none" stroke="var(--color-warning)" strokeWidth="4" className="animate-dash-flow" filter="url(#glowWarning)" />
          )}

          {/* ========================================================================= */}
          {/* 2. CPU 各論理コアコンポーネント (Logic Blocks) */}
          {/* ========================================================================= */}

          {/* (1) IR (Instruction Register - 最長3バイトの幅を確保) */}
          <g transform="translate(25, 200)">
            <rect x="0" y="0" width="86" height="35" rx="4" fill="url(#blueGrad)" stroke={isFetch ? 'var(--color-secondary)' : 'var(--border-color)'} strokeWidth="1.5" filter={isFetch ? 'url(#glowPink)' : 'none'} />
            <text x="43" y="10" textAnchor="middle" fill="var(--color-text-muted)" fontSize="7.5" fontWeight="700">IR (3-BYTE)</text>

            {/* Byte 0 */}
            <g transform="translate(5, 14)">
              <rect x="0" y="0" width="22" height="15" rx="2" fill="rgba(10, 18, 36, 0.6)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
              <text x="11" y="11" textAnchor="middle" fill={fetchBuffer.length > 0 ? 'var(--color-secondary)' : 'var(--color-text-muted)'} className="digital-display" fontSize="8" fontWeight="700">
                {fetchBuffer.length > 0 ? toHex(fetchBuffer[0]) : '--'}
              </text>
            </g>
            {/* Byte 1 */}
            <g transform="translate(32, 14)">
              <rect x="0" y="0" width="22" height="15" rx="2" fill="rgba(10, 18, 36, 0.6)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
              <text x="11" y="11" textAnchor="middle" fill={fetchBuffer.length > 1 ? 'var(--color-secondary)' : 'var(--color-text-muted)'} className="digital-display" fontSize="8" fontWeight="700">
                {fetchBuffer.length > 1 ? toHex(fetchBuffer[1]) : '--'}
              </text>
            </g>
            {/* Byte 2 */}
            <g transform="translate(59, 14)">
              <rect x="0" y="0" width="22" height="15" rx="2" fill="rgba(10, 18, 36, 0.6)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
              <text x="11" y="11" textAnchor="middle" fill={fetchBuffer.length > 2 ? 'var(--color-secondary)' : 'var(--color-text-muted)'} className="digital-display" fontSize="8" fontWeight="700">
                {fetchBuffer.length > 2 ? toHex(fetchBuffer[2]) : '--'}
              </text>
            </g>
          </g>

          {/* (2) Decoder (Instruction Decoder) */}
          <g transform="translate(130, 200)">
            <rect x="0" y="0" width="90" height="35" rx="4" fill="url(#blueGrad)" stroke={isDecode ? 'var(--color-warning)' : 'var(--border-color)'} strokeWidth="1.5" filter={isDecode ? 'url(#glowWarning)' : 'none'} />
            <text x="45" y="14" textAnchor="middle" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">Decoder</text>
            <text x="45" y="27" textAnchor="middle" fill="var(--color-warning)" fontFamily="var(--font-mono)" fontSize="8.5" fontWeight="700">
              {decoded ? `${decoded.mnemonic} ${decoded.operandText}` : isDecode ? 'DECODING...' : 'IDLE'}
            </text>
          </g>

          {/* (3) Registers List (r0 - r3) */}
          <g transform="translate(140, 25)">
            {/* r0 */}
            <g transform="translate(0, 0)">
              <rect x="0" y="0" width="50" height="22" rx="3" fill={decoded && decoded.operandText.includes('R0') ? 'rgba(0, 210, 255, 0.15)' : 'rgba(10, 18, 36, 0.5)'} stroke={decoded && decoded.operandText.includes('R0') ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'} strokeWidth="1" />
              <text x="6" y="14" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">r0</text>
              <text x="35" y="15" textAnchor="middle" fill="white" className="digital-display" fontSize="11" fontWeight="700">{r0}</text>
            </g>
            {/* r1 */}
            <g transform="translate(0, 30)">
              <rect x="0" y="0" width="50" height="22" rx="3" fill={decoded && decoded.operandText.includes('R1') ? 'rgba(0, 210, 255, 0.15)' : 'rgba(10, 18, 36, 0.5)'} stroke={decoded && decoded.operandText.includes('R1') ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'} strokeWidth="1" />
              <text x="6" y="14" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">r1</text>
              <text x="35" y="15" textAnchor="middle" fill="white" className="digital-display" fontSize="11" fontWeight="700">{r1}</text>
            </g>
            {/* r2 */}
            <g transform="translate(0, 60)">
              <rect x="0" y="0" width="50" height="22" rx="3" fill={decoded && decoded.operandText.includes('R2') ? 'rgba(0, 210, 255, 0.15)' : 'rgba(10, 18, 36, 0.5)'} stroke={decoded && decoded.operandText.includes('R2') ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'} strokeWidth="1" />
              <text x="6" y="14" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">r2</text>
              <text x="35" y="15" textAnchor="middle" fill="white" className="digital-display" fontSize="11" fontWeight="700">{r2}</text>
            </g>
            {/* r3 */}
            <g transform="translate(0, 90)">
              <rect x="0" y="0" width="50" height="22" rx="3" fill={decoded && decoded.operandText.includes('R3') ? 'rgba(0, 210, 255, 0.15)' : 'rgba(10, 18, 36, 0.5)'} stroke={decoded && decoded.operandText.includes('R3') ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'} strokeWidth="1" />
              <text x="6" y="14" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">r3</text>
              <text x="35" y="15" textAnchor="middle" fill="white" className="digital-display" fontSize="11" fontWeight="700">{r3}</text>
            </g>
          </g>

          {/* (4) MUX 1 (Register Selector Multiplexer - 台形) */}
          <g>
            <polygon
              points="220,30 240,40 240,130 220,140"
              fill="url(#blueGrad)"
              stroke="var(--border-color)"
              strokeWidth="1.2"
            />
            <text x="231" y="87" textAnchor="middle" fill="var(--color-text-muted)" fontSize="7" fontWeight="800" transform="rotate(-90 231 87)">MUX 1</text>
          </g>

          {/* (5) ALU (Arithmetic Logic Unit - 凹型ポリゴン) */}
          <g transform="translate(220, 255)">
            <polygon
              points="0,0 100,0 80,40 50,20 20,40"
              fill="url(#blueGrad)"
              stroke={isExecute && (isMathOp || isCmpOp) ? 'var(--color-success)' : 'var(--border-color)'}
              strokeWidth="1.5"
              filter={isExecute && (isMathOp || isCmpOp) ? 'url(#glowGreen)' : 'none'}
            />
            <text x="50" y="14" textAnchor="middle" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">ALU</text>
            <text x="50" y="34" textAnchor="middle" fill={isExecute && (isMathOp || isCmpOp) ? 'var(--color-success)' : 'var(--color-text-main)'} fontSize="9" fontWeight="800">
              {isExecute && isMathOp ? decoded?.mnemonic : isExecute && isCmpOp ? 'COMP' : 'IDLE'}
            </text>
          </g>

          {/* (6) PC (Program Counter) */}
          <g transform="translate(130, 310)">
            <rect x="0" y="0" width="70" height="30" rx="4" fill="url(#blueGrad)" stroke={isFetch ? 'var(--color-primary)' : 'var(--border-color)'} strokeWidth="1.5" filter={isFetch ? 'url(#glowCyan)' : 'none'} />
            <text x="35" y="11" textAnchor="middle" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">PC</text>
            <text x="35" y="24" textAnchor="middle" fill="var(--color-primary)" className="digital-display" fontSize="11" fontWeight="700">
              0x{toHex(cpu.pc)}
            </text>
          </g>

          {/* (7) Phase (実行フェーズ) */}
          <g transform="translate(130, 360)">
            <rect x="0" y="0" width="70" height="30" rx="4" fill="url(#blueGrad)" stroke="var(--border-color)" strokeWidth="1.5" />
            <text x="35" y="11" textAnchor="middle" fill="var(--color-text-muted)" fontSize="8" fontWeight="700">Phase</text>
            <text x="35" y="24" textAnchor="middle" fill="var(--color-warning)" className="digital-display" fontSize="9" fontWeight="700">
              {phase}
            </text>
          </g>

          {/* (8) MUX 2 (Address Selector Multiplexer - 台形) */}
          <g>
            <polygon
              points="340,140 360,150 360,250 340,260"
              fill="url(#blueGrad)"
              stroke="var(--border-color)"
              strokeWidth="1.2"
            />
            <text x="351" y="200" textAnchor="middle" fill="var(--color-text-muted)" fontSize="7" fontWeight="800" transform="rotate(-90 351 200)">MUX 2</text>
          </g>

          {/* (9) DAT TABLE (MMU 赤パネル) */}
          <g transform="translate(400, 165)">
            <rect x="0" y="0" width="110" height="80" rx="6" fill="url(#blueGrad)" stroke={cpu.datr === 1 ? 'var(--color-secondary)' : 'var(--border-color)'} strokeWidth="1.5" />
            <text x="55" y="12" textAnchor="middle" fill="var(--color-secondary)" fontSize="8" fontWeight="800" letterSpacing="0.5">DAT TABLE (MMU)</text>

            {/* テーブルヘッダー */}
            <g transform="translate(6, 21)" fontSize="6.5" fontWeight="700" fill="var(--color-text-muted)">
              <text x="5">PAGE (VPN)</text>
              <text x="50">V</text>
              <text x="65">FRAME (PFN)</text>
            </g>

            {/* エントリ */}
            {Array.from({ length: 4 }).map((_, p) => {
              const entry = cpu.datTable[p];
              const isSelected = hasMemAccess && addressTranslationLog?.vpn === p;
              const cellColor = entry.valid ? 'var(--color-success)' : 'var(--color-text-muted)';
              return (
                <g key={p} transform={`translate(6, ${31 + p * 11})`} fontSize="7" fontFamily="var(--font-mono)">
                  {isSelected && (
                    <rect x="-2" y="-8" width="102" height="10" fill="rgba(255, 0, 127, 0.15)" stroke="var(--color-secondary)" strokeWidth="0.5" />
                  )}
                  <text x="5" fill="white" fontWeight={isSelected ? 700 : 400}>P{p}({p * 64})</text>
                  <text x="50" fill={cellColor} fontWeight="700">{entry.valid ? '1' : '0'}</text>
                  <text x="65" fill={entry.valid ? 'white' : 'var(--color-text-muted)'}>
                    {entry.valid ? `F${entry.pfn}(${toHex(entry.pfn * 64)})` : '--'}
                  </text>
                </g>
              );
            })}
          </g>

          {/* (10) Zero Flag & Error Flag */}
          <g transform="translate(30, 350)">
            {/* ZF */}
            <g transform="translate(0, 0)">
              <circle cx="12" cy="12" r="8" fill={cpu.zf ? 'rgba(0, 255, 170, 0.2)' : 'rgba(10, 18, 36, 0.4)'} stroke={cpu.zf ? 'var(--color-success)' : 'var(--border-color)'} strokeWidth="1.2" />
              <text x="25" y="16" fill={cpu.zf ? 'var(--color-success)' : 'var(--color-text-muted)'} fontSize="8" fontWeight="700">ZF (Zero)</text>
            </g>
            {/* EF */}
            <g transform="translate(0, 25)">
              <circle cx="12" cy="12" r="8" fill={cpu.ef ? 'rgba(255, 0, 127, 0.2)' : 'rgba(10, 18, 36, 0.4)'} stroke={cpu.ef ? 'var(--color-secondary)' : 'var(--border-color)'} strokeWidth="1.2" className={cpu.ef ? 'animate-blink' : ''} />
              <text x="25" y="16" fill={cpu.ef ? 'var(--color-secondary)' : 'var(--color-text-muted)'} fontSize="8" fontWeight="700">EF (Fault)</text>
            </g>
          </g>

          {/* ========================================================================= */}
          {/* 3. HTML埋め込み: <foreignObject> によるスクロール可能な物理RAMモニター */}
          {/* ========================================================================= */}
          <foreignObject x="580" y="10" width="230" height="420">
            <div style={{
              width: '100%',
              height: '100%',
              background: 'rgba(5, 8, 17, 0.65)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-text-main)',
            }}>
              {/* RAMモニターヘッダー */}
              <div style={{
                padding: '6px 10px',
                borderBottom: '1px solid var(--border-color)',
                background: 'rgba(10, 18, 36, 0.7)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
              }}>
                <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.5px' }}>
                  PHYSICAL RAM (512B)
                </span>
                <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)' }}>
                  00-FF:ROMコピー
                </span>
              </div>

              {/* セル表示エリア (スクロール可能) */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', background: '#020408' }} className="ram-scroll-container">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {Array.from({ length: 64 }).map((_, rowIdx) => {
                    const startAddr = rowIdx * 8;
                    const frameIdx = Math.floor(startAddr / 64);
                    const mapping = getFrameMapping(frameIdx);
                    const neonColor = mapping ? PAGE_COLORS[mapping.pageIdx] : 'transparent';
                    const isFrameStart = startAddr % 64 === 0;

                    return (
                      <React.Fragment key={rowIdx}>
                        {/* 64バイト境界での仕切り */}
                        {isFrameStart && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: frameIdx > 0 ? '6px' : '0px',
                            marginBottom: '2px',
                            paddingTop: frameIdx > 0 ? '4px' : '0px',
                            borderTop: frameIdx > 0 ? '1px dashed rgba(255, 255, 255, 0.08)' : 'none',
                          }}>
                            <span style={{ fontSize: '0.58rem', fontWeight: 800, color: mapping ? neonColor : 'var(--color-text-muted)' }}>
                              F{frameIdx} (0x{toHex(startAddr, 3)})
                            </span>
                            {mapping ? (
                              <span style={{ fontSize: '0.52rem', background: `${neonColor}22`, color: neonColor, border: `1px solid ${neonColor}55`, padding: '0 3px', borderRadius: '1.5px', fontWeight: 700 }}>
                                PAGE {mapping.pageIdx}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.52rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                UNMAPPED
                              </span>
                            )}
                          </div>
                        )}

                        {/* 行 */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '1px 0',
                          borderLeft: mapping ? `1.5px solid ${neonColor}` : '1.5px solid rgba(255, 255, 255, 0.04)',
                          background: mapping ? `${neonColor}03` : 'transparent',
                        }}>
                          {/* 行アドレス */}
                          <span style={{ width: '32px', color: mapping ? neonColor : 'var(--color-text-muted)', fontSize: '0.58rem', fontFamily: 'var(--font-mono)' }}>
                            {toHex(startAddr, 3)}:
                          </span>

                          {/* 8個のセル */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 19px)', gap: '2px', flex: 1 }}>
                            {Array.from({ length: 8 }).map((_, cellIdx) => {
                              const physAddr = startAddr + cellIdx;
                              const val = cpu.ram[physAddr];

                              const isWrite = lastWriteRamAddr === physAddr;
                              const isAccess = lastAccessedRamAddr === physAddr;
                              const isPcHighlight = pcPhys !== null && (physAddr >= pcPhys && physAddr < pcPhys + currentInstBytes);

                              let cellBg = 'rgba(10, 18, 36, 0.2)';
                              let cellBorder = '1px solid rgba(255, 255, 255, 0.02)';
                              let cellColor = mapping ? neonColor : 'var(--color-text-main)';
                              let cellShadow = 'none';

                              if (isWrite) {
                                cellBg = 'rgba(255, 0, 127, 0.25)';
                                cellBorder = '1px solid var(--color-secondary)';
                                cellColor = 'var(--color-secondary)';
                                cellShadow = '0 0 3px var(--color-secondary)';
                              } else if (isAccess) {
                                cellBg = 'rgba(255, 170, 0, 0.25)';
                                cellBorder = '1px solid var(--color-warning)';
                                cellColor = 'var(--color-warning)';
                                cellShadow = '0 0 3px var(--color-warning)';
                              } else if (isPcHighlight) {
                                cellBg = 'rgba(0, 255, 170, 0.2)';
                                cellBorder = '1px solid var(--color-success)';
                                cellColor = 'var(--color-success)';
                                cellShadow = '0 0 3px var(--color-success)';
                              } else {
                                // ユーザー様の「00も含め、一律で明るい背景を適用する」というご要望を適用
                                cellBg = mapping ? `${neonColor}11` : 'rgba(255, 255, 255, 0.04)';
                              }

                              return (
                                <div
                                  key={cellIdx}
                                  title={`Phys Addr: 0x${toHex(physAddr, 3)}\nValue: ${val} (0x${toHex(val)})`}
                                  style={{
                                    width: '19px',
                                    height: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '1.5px',
                                    background: cellBg,
                                    border: cellBorder,
                                    color: cellColor,
                                    fontWeight: 700, // 常に太字でハッキリ表示
                                    boxShadow: cellShadow,
                                    fontSize: '0.55rem',
                                    fontFamily: 'var(--font-mono)',
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  {toHex(val)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          </foreignObject>
        </svg>
      </div>

      {/* アニメーションステータス表示 (フッター) */}
      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(10, 18, 36, 0.4)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(0, 210, 255, 0.05)' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          🔍 現在のフェーズ: <strong className="glow-text-cyan">{phase}</strong>
        </span>
        {isFetch && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>
            ⚡ PC ➔ アドレスバス ➔ RAM ➔ データバス ➔ IR (命令フェッチ中...)
          </span>
        )}
        {isDecode && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600 }}>
            ⚙️ 命令デコーダが動作中... ({decoded?.mnemonic} の解析)
          </span>
        )}
        {isExecute && decoded && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>
            ⚡ 実行データパス稼働中 ({decoded.mnemonic})
            {hasMemAccess && addressTranslationLog?.success && (
              <span style={{ color: 'var(--color-warning)' }}>
                &nbsp;[RAM物理アクセス: 0x{toHex(addressTranslationLog.physicalAddr || 0, 3)}]
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
};
