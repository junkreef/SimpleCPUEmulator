import { InstructionDef } from './types';

export const InstructionSet: Record<number, InstructionDef> = {
  // --- ADD (加算) ---
  0x01: {
    opcode: 0x01,
    mnemonic: 'ADD',
    bytes: 2,
    operandType: 'reg_reg',
    execute: (cpu, [rd, rs]) => {
      cpu.registers[rd] = (cpu.registers[rd] + cpu.registers[rs]) & 0xFF;
    },
    explain: ([rd, rs]) => `レジスタ R${rd} に レジスタ R${rs} の値を加算します。`,
  },
  0x02: {
    opcode: 0x02,
    mnemonic: 'ADD',
    bytes: 3,
    operandType: 'reg_imm',
    execute: (cpu, [rd, imm]) => {
      cpu.registers[rd] = (cpu.registers[rd] + imm) & 0xFF;
    },
    explain: ([rd, imm]) => `レジスタ R${rd} に 値 ${imm} (0x${imm.toString(16).toUpperCase()}) を加算します。`,
  },

  // --- SUB (減算) ---
  0x03: {
    opcode: 0x03,
    mnemonic: 'SUB',
    bytes: 2,
    operandType: 'reg_reg',
    execute: (cpu, [rd, rs]) => {
      cpu.registers[rd] = (cpu.registers[rd] - cpu.registers[rs] + 256) & 0xFF;
    },
    explain: ([rd, rs]) => `レジスタ R${rd} から レジスタ R${rs} の値を減算します。`,
  },
  0x04: {
    opcode: 0x04,
    mnemonic: 'SUB',
    bytes: 3,
    operandType: 'reg_imm',
    execute: (cpu, [rd, imm]) => {
      cpu.registers[rd] = (cpu.registers[rd] - imm + 256) & 0xFF;
    },
    explain: ([rd, imm]) => `レジスタ R${rd} から 値 ${imm} (0x${imm.toString(16).toUpperCase()}) を減算します。`,
  },

  // --- CMP (比較) ---
  0x05: {
    opcode: 0x05,
    mnemonic: 'CMP',
    bytes: 2,
    operandType: 'reg_reg',
    execute: (cpu, [ra, rb]) => {
      cpu.zf = cpu.registers[ra] === cpu.registers[rb];
    },
    explain: ([ra, rb]) => `レジスタ R${ra} と レジスタ R${rb} の値を比較します（等しければZFフラグがONになります）。`,
  },
  0x06: {
    opcode: 0x06,
    mnemonic: 'CMP',
    bytes: 3,
    operandType: 'reg_imm',
    execute: (cpu, [ra, imm]) => {
      cpu.zf = cpu.registers[ra] === imm;
    },
    explain: ([ra, imm]) => `レジスタ R${ra} と 値 ${imm} (0x${imm.toString(16).toUpperCase()}) を比較します（等しければZFフラグがONになります）。`,
  },

  // --- LOAD (メモリ/即値からロード) ---
  0x10: {
    opcode: 0x10,
    mnemonic: 'LOAD',
    bytes: 3,
    operandType: 'reg_imm',
    execute: (cpu, [rd, imm]) => {
      cpu.registers[rd] = imm;
    },
    explain: ([rd, imm]) => `レジスタ R${rd} に 値 ${imm} (0x${imm.toString(16).toUpperCase()}) を代入（ロード）します。`,
  },
  0x11: {
    opcode: 0x11,
    mnemonic: 'LOAD',
    bytes: 3,
    operandType: 'reg_addr',
    execute: (cpu, [rd, addr], { readMem }) => {
      cpu.registers[rd] = readMem(addr);
    },
    explain: ([rd, addr]) => `仮想アドレス 0x${addr.toString(16).toUpperCase().padStart(2, '0')} のメモリから値を読み込み、レジスタ R${rd} に代入します。`,
  },
  0x12: {
    opcode: 0x12,
    mnemonic: 'LOAD',
    bytes: 2,
    operandType: 'reg_ind',
    execute: (cpu, [rd, ra], { readMem }) => {
      const addr = cpu.registers[ra];
      cpu.registers[rd] = readMem(addr);
    },
    explain: ([rd, ra]) => `レジスタ R${ra} が指す仮想アドレスから値を読み込み、レジスタ R${rd} に代入（間接ロード）します。`,
  },

  // --- STORE (メモリへストア) ---
  0x20: {
    opcode: 0x20,
    mnemonic: 'STORE',
    bytes: 3,
    operandType: 'addr_reg',
    execute: (cpu, [addr, rs], { writeMem }) => {
      writeMem(addr, cpu.registers[rs]);
    },
    explain: ([addr, rs]) => `レジスタ R${rs} の値を、仮想アドレス 0x${addr.toString(16).toUpperCase().padStart(2, '0')} のメモリに書き込み（ストア）します。`,
  },
  0x21: {
    opcode: 0x21,
    mnemonic: 'STORE',
    bytes: 2,
    operandType: 'ind_reg',
    execute: (cpu, [ra, rs], { writeMem }) => {
      const addr = cpu.registers[ra];
      writeMem(addr, cpu.registers[rs]);
    },
    explain: ([ra, rs]) => `レジスタ R${rs} の値を、レジスタ R${ra} が指す仮想アドレスのメモリに書き込み（間接ストア）します。`,
  },

  // --- BRANCH (条件分岐) ---
  0x30: {
    opcode: 0x30,
    mnemonic: 'BR',
    bytes: 2,
    operandType: 'addr',
    execute: (cpu, [addr]) => {
      cpu.pc = addr;
    },
    explain: ([addr]) => `無条件でプログラムの実行位置を アドレス 0x${addr.toString(16).toUpperCase().padStart(2, '0')} に移します（ジャンプ）。`,
  },
  0x31: {
    opcode: 0x31,
    mnemonic: 'BEQ',
    bytes: 2,
    operandType: 'addr',
    execute: (cpu, [addr]) => {
      if (cpu.zf) {
        cpu.pc = addr;
      }
    },
    explain: ([addr]) => `前回の比較が「一致（ZFフラグがON）」していれば、アドレス 0x${addr.toString(16).toUpperCase().padStart(2, '0')} にジャンプします。`,
  },
  0x32: {
    opcode: 0x32,
    mnemonic: 'BNE',
    bytes: 2,
    operandType: 'addr',
    execute: (cpu, [addr]) => {
      if (!cpu.zf) {
        cpu.pc = addr;
      }
    },
    explain: ([addr]) => `前回の比較が「不一致（ZFフラグがOFF）」なら、アドレス 0x${addr.toString(16).toUpperCase().padStart(2, '0')} にジャンプします。`,
  },

  // --- DAT (動的アドレス変換) ---
  0x40: {
    opcode: 0x40,
    mnemonic: 'DATSET',
    bytes: 2,
    operandType: 'page_frame',
    execute: (cpu, [page, frame]) => {
      if (page >= 0 && page < 4) {
        const tableAddr = (cpu.cr1 << 6) + page;
        cpu.ram[tableAddr] = 0x80 | (frame & 0x07);
      }
    },
    explain: ([page, frame]) => `現在 CR1 (PASCE) が指す物理RAM上のページテーブルに、仮想ページ ${page} から物理フレーム ${frame} へのマッピングを登録し、有効化します。`,
  },
  0x41: {
    opcode: 0x41,
    mnemonic: 'DATCLR',
    bytes: 2,
    operandType: 'page',
    execute: (cpu, [page]) => {
      if (page >= 0 && page < 4) {
        const tableAddr = (cpu.cr1 << 6) + page;
        cpu.ram[tableAddr] = 0x00;
      }
    },
    explain: ([page]) => `現在 CR1 (PASCE) が指す物理RAM上のページテーブルの仮想ページ ${page} のマッピングを解除（無効化）します。`,
  },
  0x42: {
    opcode: 0x42,
    mnemonic: 'DATEN',
    bytes: 1,
    operandType: 'none',
    execute: (cpu) => {
      cpu.datr = 1;
    },
    explain: () => `DAT（動的アドレス変換）機能を有効にします。これ以降、アドレスアクセスはCR1が指す物理RAM上のページテーブルを介してマッピングされます。`,
  },
  0x43: {
    opcode: 0x43,
    mnemonic: 'DATDIS',
    bytes: 1,
    operandType: 'none',
    execute: (cpu) => {
      cpu.datr = 0;
    },
    explain: () => `DAT（動的アドレス変換）機能を無効にします。アドレスアクセスは物理RAMの先頭（0x00 ~ 0xFF）に直接マッピングされます。`,
  },
  0x44: {
    opcode: 0x44,
    mnemonic: 'LCTL',
    bytes: 2,
    operandType: 'cr_reg',
    execute: (cpu, [rs]) => {
      cpu.cr1 = cpu.registers[rs] & 0x07;
    },
    explain: ([rs]) => `コントロールレジスタ CR1 (PASCE) に、レジスタ R${rs} の値（物理ページテーブルのフレーム番号 0〜7）をロードします（OS特権命令）。`,
  },

  // --- SYSTEM (システム) ---
  0xFF: {
    opcode: 0xFF,
    mnemonic: 'HALT',
    bytes: 1,
    operandType: 'none',
    execute: (cpu) => {
      cpu.halted = true;
    },
    explain: () => `CPUの実行を正常終了（停止）します。`,
  },
};

// 逆引き用マップ (ニーモニックからオペコードへの紐付け。アセンブラで使用)
export const MnemonicMap: Record<string, InstructionDef[]> = {};
for (const def of Object.values(InstructionSet)) {
  if (!MnemonicMap[def.mnemonic]) {
    MnemonicMap[def.mnemonic] = [];
  }
  MnemonicMap[def.mnemonic].push(def);
}
