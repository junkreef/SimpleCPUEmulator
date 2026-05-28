export interface DATEntry {
  valid: boolean;
  pfn: number; // 物理フレーム番号 (0 ~ 7)
}

export interface CPUState {
  registers: number[]; // R0, R1, R2, R3 (各8bit)
  pc: number;          // プログラムカウンタ (8bit)
  datr: number;        // DAT制御レジスタ (8bit、下位1bitが有効フラグ)
  cr1: number;         // コントロールレジスタ1 (PASCE / ページテーブルの物理フレーム番号 0~7)
  zf: boolean;         // ゼロフラグ
  ef: boolean;         // エラーフラグ (DAT例外等)
  halted: boolean;     // 実行停止フラグ
  ram: Uint8Array;     // 内蔵RAM (512バイト)
  rom: Uint8Array;     // ROM (256バイト)
}

export type OperandType =
  | 'none'
  | 'reg_reg'
  | 'reg_imm'
  | 'reg_addr'
  | 'addr_reg'
  | 'reg_ind'
  | 'ind_reg'
  | 'addr'
  | 'page_frame'
  | 'page'
  | 'cr_reg';

export interface DecodedInstruction {
  opcode: number;
  mnemonic: string;
  bytes: number;
  operands: number[];
  operandText: string;
  explanation: string;
}

export interface InstructionDef {
  opcode: number;
  mnemonic: string;
  bytes: number;
  operandType: OperandType;
  execute: (
    cpu: CPUState,
    operands: number[],
    helpers: {
      readMem: (addr: number) => number;
      writeMem: (addr: number, val: number) => boolean;
    }
  ) => void;
  explain: (operands: number[]) => string;
}

export type CPUPhase = 'FETCH' | 'DECODE' | 'EXECUTE' | 'HALTED' | 'FAULT';

export interface CPUExecutionState {
  cpu: CPUState;
  phase: CPUPhase;
  decoded: DecodedInstruction | null;
  // デコーダで次に読み込むバイト数など、可変長デコードの中間状態
  fetchBuffer: number[];
  lastAccessedRamAddr: number | null;
  lastAccessedRomAddr: number | null;
  lastWriteRamAddr: number | null;
  addressTranslationLog: {
    virtualAddr: number;
    vpn: number;
    offset: number;
    valid: boolean;
    pfn: number | null;
    physicalAddr: number | null;
    success: boolean;
  } | null;
}
