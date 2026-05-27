import React, { useState, useEffect } from 'react';
import { AssembleError } from '../emulator/assembler';

interface CodeEditorProps {
  onAssemble: (code: string) => { success: boolean; errors: AssembleError[] };
  initialCode?: string;
  isCpuRunning: boolean;
}

const PRESETS = [
  {
    id: 'sum',
    name: '1. 足し算ループ (1から10の総和)',
    code: `; 1から10の総和を計算するプログラム
LOAD R0, 0    ; R0 = 0 (合計値初期化)
LOAD R1, 10   ; R1 = 10 (カウンタ)

loop:
ADD R0, R1    ; R0 = R0 + R1
SUB R1, 1     ; R1 = R1 - 1
CMP R1, 0     ; カウンタが0になったか比較
BNE loop      ; 0でなければ loop へジャンプ

HALT          ; プログラム停止
`,
  },
  {
    id: 'dat-basic',
    name: '2. DATによる仮想メモリの魔術 (メモリ切り替え & 全アクセス検証)',
    code: `; DATを用いた動的アドレス変換のデモ
; すべてのアドレス指定方式（即値、直接アドレス、レジスタ間接）の
; データパスおよびバス（アドレス・データ）の描画の違いを完璧に観察できます。

; 1. 即値ロード (Rd, imm8) 
; ★バスは一切使われず、デコーダから直接レジスタに値が入ります！
LOAD R0, 99     ; R0 = 99 (書き込む値1)
LOAD R1, 170    ; R1 = 170 (書き込む値2)

; 2. DATの設定をして有効化
DATSET 1, 3     ; ページ1(0x40~0x7F) -> 物理フレーム3(0x0C0~0x0FF)
DATSET 2, 5     ; ページ2(0x80~0xBF) -> 物理フレーム5(0x140~0x17F)
DATEN           ; DATを有効化！

; 3. メモリ直接ストア (STORE [addr], Rs)
; ★デコーダからアドレスが出力され、R0のデータがRAMに送られます！
STORE [0x40], R0 ; ページ1(仮想0x40)に R0(99) を書き込む

; 4. レジスタ間接ストア (STORE [Ra], Rs)
; ★R2が指すアドレス(0x80)が出力され、R1のデータがRAMに送られます！
LOAD R2, 128    ; R2 = 0x80 (即値ロード)
STORE [R2], R1  ; ページ2(仮想R2すなわち0x80)に R1(170) を書き込む

; 5. メモリ直接ロード (LOAD Rd, [addr])
; ★デコーダからアドレスが出力され、RAMからRdにデータが戻ります！
LOAD R3, [0x40] ; R3 = 99 (物理フレーム3から読み出される)

; 6. レジスタ間接ロード (LOAD Rd, [Ra])
; ★R2が指すアドレスが出力され、RAMからRd(R1)にデータが戻ります！
LOAD R1, [R2]   ; R1 = 170 (R2が指す物理フレーム5から読み出される)

; 7. DATを無効化して直接アクセス
DATDIS          ; DATを無効化！
LOAD R3, [0x40] ; R3 = 物理RAMの0x40から直接ロード (元々のコードが読まれる)

HALT
`,
  },
  {
    id: 'context-switch',
    name: '3. OS風コンテキストスイッチデモ',
    code: `; OSによるコンテキストスイッチの簡易シミュレーション
; プロセスA(フレーム3)とプロセスB(フレーム4)を切り替えます

; 1. 初期マッピング (ページ1 -> フレーム3)
DATSET 1, 3
DATEN

; --- プロセスAの実行 ---
LOAD R0, 10   ; プロセスAの作業データ (R0 = 10)
; コンテキスト退避 (プロセスAの仮想アドレス 0x40 にR0を退避)
STORE [0x40], R0

; --- コンテキストスイッチ(OSの役割) ---
; ページ1(実行空間)のマッピングをフレーム4(プロセスBの実体)に切り替え！
DATSET 1, 4

; --- プロセスBの実行 ---
; プロセスBの仮想アドレス 0x40 から以前の状態を復元
LOAD R0, [0x40] ; 新しいフレーム4からデータがロードされる (初期は0)
ADD R0, 50      ; プロセスBでの処理 (R0 = 50)
; プロセスBの状態を保存
STORE [0x40], R0

; --- 再びコンテキストスイッチ ---
; ページ1をフレーム3(プロセスAの実体)に復元
DATSET 1, 3
LOAD R0, [0x40] ; プロセスAのデータ(10)が復元される！

HALT
`,
  },
  {
    id: 'comprehensive-parade',
    name: '4. 総合検証パレード (全命令＆データパス描画テスト)',
    code: `; === 総合検証用・全命令パレードプログラム ===
; このプログラムは、エミュレータがサポートするほぼすべての命令を実行し、
; それぞれのデータパスおよびバス（アドレス・データ）の描画挙動を検証できます。

; 1. 即値ロード (LOAD Rd, imm8) 
; ★バスは一切使われず、デコーダから直接レジスタに値が入ります（消灯確認）
LOAD R0, 10     ; R0 = 10 (カウンタ初期値)
LOAD R1, 5      ; R1 = 5  (加算する値)
LOAD R2, 0      ; R2 = 0  (結果格納用)

; 2. 算術演算 & フラグ・分岐検証 (ADD, SUB, CMP, BNE/BEQ)
; ★ALUが緑色に発光し、ZF(Zero Flag)の点灯と、条件分岐時のPC更新を確認します
loop:
ADD R2, R1      ; R2 = R2 + R1 (ALU加算実行)
SUB R0, 1       ; R0 = R0 - 1  (カウンタ減算)
CMP R0, 0       ; カウンタが0になったか比較 (ALU COMP動作)
BNE loop        ; 0でなければ loop へジャンプ

; 3. メモリ直接アクセス検証 (STORE [addr], Rs / LOAD Rd, [addr])
; ★物理RAMへのアクセス。アドレス黄パルスと、ストア(ピンク)/ロード(緑)パルスを確認
STORE [0x60], R2 ; 演算結果 R2 の値を 仮想アドレス 0x60 (RAM) に直接書き込む
LOAD R3, [0x60]  ; 仮想アドレス 0x60 から値を R3 に直接読み出す

; 4. DAT（動的アドレス変換）とレジスタ間接アクセス検証
; ★DAT Table (MMU赤パネル) が有効化され、レジスタ間接指定時のゴールド発光ラインを検証
DATSET 1, 3      ; ページ1 (仮想0x40~0x7F) -> 物理フレーム3 (物理0x0C0~0x0FF) にマップ
DATEN            ; DAT有効化！ (DAT Tableがオンになり、変換が始まります)

LOAD R0, 64      ; R0 = 64 (0x40: ページ1の先頭仮想アドレス)
STORE [R0], R3   ; R0が指すアドレス(仮想0x40 -> 物理0xC0)に R3 の値を間接ストア
LOAD R1, [R0]    ; R0が指す物理アドレスから R1 に間接ロード

; 5. マッピング解除とDAT無効化検証
DATCLR 1         ; ページ1のマッピングを解除
DATDIS           ; DAT無効化！

HALT             ; CPU停止
`,
  },
];

export const CodeEditor: React.FC<CodeEditorProps> = ({
  onAssemble,
  initialCode = PRESETS[0].code,
  isCpuRunning,
}) => {
  const [code, setCode] = useState(initialCode);
  const [errors, setErrors] = useState<AssembleError[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // プリセットの変更
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = PRESETS.find((p) => p.id === e.target.value);
    if (selected) {
      setCode(selected.code);
      setErrors([]);
      setSuccessMessage(null);
    }
  };

  // アセンブル実行
  const handleAssemble = () => {
    setSuccessMessage(null);
    setErrors([]);
    const res = onAssemble(code);
    if (res.success) {
      setSuccessMessage('⚡ アセンブル成功！ ROMにプログラムを書き込み、PCを0にセットしました。');
    } else {
      setErrors(res.errors);
    }
  };

  // 自動的に初回アセンブル
  useEffect(() => {
    handleAssemble();
  }, []);

  return (
    <div className="cyber-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ヘッダーセクション */}
      <div style={{ padding: '16px 16px 12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            ASSEMBLY EDITOR
          </h2>
          <button
            className="cyber-button success"
            onClick={handleAssemble}
            disabled={isCpuRunning}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            アセンブル & ROM書込
          </button>
        </div>

        {/* プリセットプログラム選択 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>サンプル:</label>
          <select
            onChange={handlePresetChange}
            disabled={isCpuRunning}
            style={{
              flex: 1,
              background: '#0d162a',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--color-text-main)',
              fontSize: '0.85rem',
              padding: '6px 10px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* エディタ本体 (行番号＋テキストエリア) */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden', background: '#03060d' }}>
        {/* 行番号表示 */}
        <div
          style={{
            width: '40px',
            background: 'rgba(10, 18, 36, 0.5)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            padding: '12px 8px',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            lineHeight: '1.5',
            userSelect: 'none',
          }}
        >
          {code.split('\n').map((_, index) => (
            <div key={index} style={{ height: '22px' }}>
              {index + 1}
            </div>
          ))}
        </div>

        {/* テキスト編集エリア */}
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isCpuRunning}
          spellCheck="false"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-main)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            lineHeight: '1.5',
            padding: '12px',
            outline: 'none',
            resize: 'none',
            overflowY: 'auto',
            whiteSpace: 'pre',
          }}
        />
      </div>

      {/* エラー & メッセージ表示領域 */}
      {(errors.length > 0 || successMessage) && (
        <div
          style={{
            background: '#0a0f1d',
            borderTop: '1px solid var(--border-color)',
            maxHeight: '180px',
            overflowY: 'auto',
            padding: '12px 16px',
          }}
        >
          {successMessage && (
            <div style={{ color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 500 }}>
              {successMessage}
            </div>
          )}
          {errors.map((err, idx) => (
            <div
              key={idx}
              style={{
                color: 'var(--color-secondary)',
                fontSize: '0.8rem',
                marginBottom: idx < errors.length - 1 ? '8px' : 0,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <span
                style={{
                  background: 'rgba(255, 0, 127, 0.1)',
                  border: '1px solid var(--color-secondary)',
                  borderRadius: '3px',
                  padding: '1px 5px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                Line {err.line}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{err.message}</span>
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '2px' }}>
                  &gt; {err.text}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
