import React from 'react';
import { CPUExecutionState } from '../emulator/types';

interface InstructionExplainerProps {
  execState: CPUExecutionState;
}

export const InstructionExplainer: React.FC<InstructionExplainerProps> = ({ execState }) => {
  const { cpu, phase, decoded, addressTranslationLog } = execState;

  // フェーズごとの標準説明
  let phaseTitle = '状態解説';
  let phaseDesc = 'CPUはクロックが入るのを待っています。上の「自動実行」または「1フェーズ進む」をクリックしてください。';
  let themeColor = 'var(--color-primary)';

  switch (phase) {
    case 'FETCH':
      phaseTitle = '1. FETCH (命令フェッチ)';
      phaseDesc = `プログラムカウンタ PC (値: 0x${cpu.pc.toString(16).toUpperCase().padStart(2, '0')}) が指す番地をDATで変換し、その物理RAMの番地から次の命令のオペコード（1バイト目）を読み出します。`;
      themeColor = 'var(--color-primary)';
      break;

    case 'DECODE':
      phaseTitle = '2. DECODE (命令デコード)';
      phaseDesc = `命令デコーダが、フェッチした機械語バイト列を解析し、どの命令（ニーモニック）で、どのような引数（レジスタや即値など）が指定されているかを読み解きます。`;
      themeColor = 'var(--color-warning)';
      break;

    case 'EXECUTE':
      phaseTitle = '3. EXECUTE (命令実行)';
      phaseDesc = `デコードされた命令を実際に実行します。計算ならALU、メモリ転送ならRAMへの読み書き、分岐ならPCの書き換えなどを行います。`;
      themeColor = 'var(--color-success)';
      break;

    case 'HALTED':
      phaseTitle = '🏁 HALT (実行停止)';
      phaseDesc = 'HALT命令が実行されました。プログラムの実行は正常に停止しました。リセットボタンで最初から再実行できます。';
      themeColor = 'var(--color-success)';
      break;

    case 'FAULT':
      phaseTitle = '🛑 FAULT (アドレス変換例外)';
      phaseDesc = 'DATによる動的アドレス変換の実行中、アクセス権限がないか、有効な物理フレームが割り当てられていない仮想メモリ領域へのアクセスが発生し、CPUがエラー停止（例外発生）しました。';
      themeColor = 'var(--color-secondary)';
      break;
  }

  return (
    <div className="cyber-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '130px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: themeColor,
            boxShadow: `0 0 8px ${themeColor}`,
          }}
        />
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: themeColor, textTransform: 'uppercase', letterSpacing: '1px' }}>
          {phaseTitle}
        </h3>
      </div>

      <p style={{ fontSize: '0.85rem', lineHeight: '1.5', color: 'var(--color-text-main)' }}>
        {phaseDesc}
      </p>

      {/* デコード済み命令のビジュアル詳細表示 (DECODE / EXECUTE フェーズ時) */}
      {decoded && (phase === 'DECODE' || phase === 'EXECUTE') && (
        <div
          style={{
            background: 'rgba(0, 210, 255, 0.03)',
            border: '1px solid rgba(0, 210, 255, 0.2)',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginTop: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>デコードされた命令:</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--color-primary)',
                background: 'rgba(0, 210, 255, 0.1)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              {decoded.mnemonic} {decoded.operandText}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-main)', marginTop: '4px', borderTop: '1px dashed rgba(0, 210, 255, 0.1)', paddingTop: '6px' }}>
            🔍 <strong>動作:</strong> {decoded.explanation}
          </div>
        </div>
      )}

      {/* DATアドレス変換詳細ログの表示 (EXECUTE フェーズでメモリアクセスが発生した時) */}
      {addressTranslationLog && (
        <div
          style={{
            background: addressTranslationLog.success ? 'rgba(0, 255, 170, 0.03)' : 'rgba(255, 0, 127, 0.03)',
            border: `1px solid ${addressTranslationLog.success ? 'rgba(0, 255, 170, 0.2)' : 'rgba(255, 0, 127, 0.2)'}`,
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>🌐 Dynamic Address Transition (DAT):</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: addressTranslationLog.success ? 'var(--color-success)' : 'var(--color-secondary)' }}>
              {addressTranslationLog.success ? 'ADDRESS TRANS TRANSLATED' : 'TRANSLATION FAULT'}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              borderTop: '1px dashed rgba(255, 255, 255, 0.05)',
              paddingTop: '6px',
            }}
          >
            <div>
              仮想アドレス: <span className="glow-text-cyan">0x{addressTranslationLog.virtualAddr.toString(16).toUpperCase().padStart(2, '0')}</span>
              <br />
              └ ページ番号 (VPN): <span style={{ color: 'white' }}>{addressTranslationLog.vpn}</span> (上位2bit)
              <br />
              └ オフセット: <span style={{ color: 'white' }}>0x{addressTranslationLog.offset.toString(16).toUpperCase()}</span> (下位6bit)
            </div>

            <div>
              {cpu.datr === 1 ? (
                <>
                  マッピング状況: {addressTranslationLog.valid ? (
                    <span style={{ color: 'var(--color-success)' }}>VALID</span>
                  ) : (
                    <span style={{ color: 'var(--color-secondary)' }}>INVALID (未登録)</span>
                  )}
                  <br />
                  └ 物理フレーム (PFN): <span style={{ color: 'white' }}>{addressTranslationLog.pfn !== null ? addressTranslationLog.pfn : 'なし'}</span>
                  <br />
                  物理アドレス: {addressTranslationLog.success ? (
                    <span className="glow-text-green">0x{addressTranslationLog.physicalAddr?.toString(16).toUpperCase().padStart(3, '0')}</span>
                  ) : (
                    <span className="glow-text-pink">変換失敗</span>
                  )}
                </>
              ) : (
                <>
                  DATモード: <span style={{ color: 'var(--color-text-muted)' }}>無効 (ストレート)</span>
                  <br />
                  物理アドレス: <span className="glow-text-green">0x{addressTranslationLog.physicalAddr?.toString(16).toUpperCase().padStart(3, '0')}</span>
                </>
              )}
            </div>
          </div>

          {!addressTranslationLog.success && (
            <div style={{ color: 'var(--color-secondary)', fontSize: '0.78rem', fontWeight: 600, marginTop: '4px', borderTop: '1px solid rgba(255, 0, 127, 0.1)', paddingTop: '4px' }}>
              ⚠️ エラー分析: 仮想ページ {addressTranslationLog.vpn} に対する物理フレームマッピングが登録されていません。`DATSET {addressTranslationLog.vpn}, [物理フレーム番号]` を実行して有効なフレームを登録するか、`DATDIS` でDATを無効化する必要があります。
            </div>
          )}
        </div>
      )}
    </div>
  );
};
