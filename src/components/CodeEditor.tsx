import React, { useState, useEffect, useRef } from 'react';
import { AssembleError } from '../emulator/assembler';

interface CodeEditorProps {
  onAssemble: (code: string) => { success: boolean; errors: AssembleError[] };
  initialCode?: string;
  isCpuRunning: boolean;
  breakpoints: Set<number>;
  onToggleBreakpoint: (line: number) => void;
  currentLine: number | null;
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
    name: '3. OS風マルチタスク・動的コード配置デモ',
    code: `; === OSによるプログラム動的配置 ＆ 時分割スケジューラデモ ===
; OSが物理RAM上の別フレームに、プロセスAとプロセスBのコードとデータを
; 直接コピー（配置）し、CR1の切り替えだけで両プロセスを並走させます。
; プロセスは両方とも「全く同じ仮想アドレス 0x00」で実行を開始します！

; --- 1. プロセスAのコード動的配置 (物理フレーム3) ---
; DAT無効時は 0xC0 (物理フレーム3の先頭) に直接ストアして配置できます。
; プロセスAの内容: LOAD R1, 10; STORE [0x40], R1; DATDIS; BR taskA_done
LOAD R0, 0x10     ; LOAD R1, imm の Opcode
STORE [0xC0], R0
LOAD R0, 1        ; レジスタ R1
STORE [0xC1], R0
LOAD R0, 10       ; 即値 10
STORE [0xC2], R0
LOAD R0, 0x20     ; STORE [addr], Rs の Opcode
STORE [0xC3], R0
LOAD R0, 1        ; レジスタ R1
STORE [0xC4], R0
LOAD R0, 0x40     ; 仮想アドレス 0x40
STORE [0xC5], R0
LOAD R0, 0x43     ; DATDIS (DAT無効化) の Opcode
STORE [0xC6], R0
LOAD R0, 0x30     ; BR (無条件分岐) の Opcode
STORE [0xC7], R0
LOAD R0, taskA_done ; 復帰先OSアドレス
STORE [0xC8], R0

; --- 2. プロセスBのコード動的配置 (物理フレーム4) ---
; 物理フレーム4 (物理0x100~) はDAT無効時はアクセスできません。
; そのため、ページ2 (仮想0x80) にフレーム4を一時マッピングして配置します。
DATSET 2, 4
DATEN             ; DAT一時有効化

; プロセスBの内容: LOAD R1, [0x40]; ADD R1, 89; STORE [0x40], R1; DATDIS; BR taskB_done
LOAD R0, 0x11     ; LOAD R1, [addr] の Opcode
STORE [0x80], R0
LOAD R0, 1        ; レジスタ R1
STORE [0x81], R0
LOAD R0, 0x40     ; 仮想アドレス 0x40
STORE [0x82], R0
LOAD R0, 0x02     ; ADD R1, imm の Opcode
STORE [0x83], R0
LOAD R0, 1        ; レジスタ R1
STORE [0x84], R0
LOAD R0, 89       ; 即値 89 (0 + 89)
STORE [0x85], R0
LOAD R0, 0x20     ; STORE [addr], Rs の Opcode
STORE [0x86], R0
LOAD R0, 1        ; レジスタ R1
STORE [0x87], R0
LOAD R0, 0x40     ; 仮想アドレス 0x40
STORE [0x88], R0
LOAD R0, 0x43     ; DATDIS の Opcode
STORE [0x89], R0
LOAD R0, 0x30     ; BR の Opcode
STORE [0x8A], R0
LOAD R0, taskB_done ; 復帰先OSアドレス
STORE [0x8B], R0

DATDIS            ; 一旦DATを無効化 (物理空間に戻る)

; --- 3. ページテーブルの初期構築 (OSの仕事) ---
; タスクAのテーブル (物理フレーム1)
LOAD R0, 1
LCTL CR1, R0
DATSET 0, 3       ; 仮想0x00~ (コード) -> 物理フレーム3
DATSET 1, 5       ; 仮想0x40~ (データ) -> 物理フレーム5

; タスクBのテーブル (物理フレーム2)
LOAD R0, 2
LCTL CR1, R0
DATSET 0, 4       ; 仮想0x00~ (コード) -> 物理フレーム4
DATSET 1, 6       ; 仮想0x40~ (データ) -> 物理フレーム6

; --- 4. スケジューラループ (マルチタスク実行開始) ---
scheduler_loop:

; [プロセスAを実行]
LOAD R0, 1
LCTL CR1, R0      ; プロセスAのアドレススペースを選択
DATEN             ; DATを本稼働！
BR 0x00           ; 仮想アドレス 0x00 へ分岐して実行！ (完了すると taskA_done に戻る)

taskA_done:
; プロセスAが書き込んだデータ (10) は、安全に物理フレーム5 (0x140) に保存されています。

; [プロセスBを実行]
LOAD R0, 2
LCTL CR1, R0      ; プロセスBのアドレススペースを選択
DATEN             ; DATを本稼働！
BR 0x00           ; 仮想アドレス 0x00 へ分岐して実行！ (完了すると taskB_done に戻る)

taskB_done:
; プロセスBが計算したデータ (89) は、安全に物理フレーム6 (0x180) に保存されています。

; [確認のため、再びプロセスAを実行]
; 以前のデータ (10) がメモリに保存されているため、再実行でデータが上書きされます。
LOAD R0, 1
LCTL CR1, R0
DATEN
BR 0x00

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
  breakpoints,
  onToggleBreakpoint,
  currentLine,
}) => {
  const [code, setCode] = useState(initialCode);
  const [errors, setErrors] = useState<AssembleError[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

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
          ref={lineNumbersRef}
          style={{
            width: '48px', // ブレークポイントインジケータ表示のために少し幅を広げる（40px -> 48px）
            background: 'rgba(10, 18, 36, 0.5)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            padding: '12px 0', // パディング左右を0にして、行要素側でパディングを管理する
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            userSelect: 'none',
            overflowY: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {code.split('\n').map((_, index) => {
            const lineNum = index + 1;
            const hasBreakpoint = breakpoints.has(lineNum);
            const isCurrent = currentLine === lineNum;
            return (
              <div
                key={index}
                onClick={() => !isCpuRunning && onToggleBreakpoint(lineNum)}
                style={{
                  height: '22px',
                  lineHeight: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 6px 0 8px',
                  cursor: isCpuRunning ? 'not-allowed' : 'pointer',
                  background: isCurrent ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
                  borderLeft: isCurrent ? '3px solid var(--color-primary)' : '3px solid transparent',
                  transition: 'background 0.2s, border-left 0.2s',
                }}
                title={isCpuRunning ? undefined : "クリックしてブレークポイントを切り替え"}
              >
                {/* ブレークポイントインジケータ */}
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: hasBreakpoint ? 'var(--color-secondary)' : 'transparent',
                    boxShadow: hasBreakpoint ? '0 0 8px var(--color-secondary)' : 'none',
                    display: 'inline-block',
                    transition: 'background 0.2s, box-shadow 0.2s',
                  }}
                />
                <span style={{ fontSize: '0.8rem', opacity: isCurrent ? 1 : 0.6, color: isCurrent ? 'var(--color-primary)' : 'inherit', fontWeight: isCurrent ? 700 : 'normal' }}>
                  {lineNum}
                </span>
              </div>
            );
          })}
        </div>

        {/* テキスト編集エリア */}
        <textarea
          ref={textareaRef}
          onScroll={handleScroll}
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
            lineHeight: '22px',
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
