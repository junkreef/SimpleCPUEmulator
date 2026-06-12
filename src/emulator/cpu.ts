import { CPUState, CPUExecutionState } from './types';
import { InstructionSet } from './instructionSet';

// CPUの初期状態を生成
export const initCPUState = (romData?: Uint8Array): CPUState => {
  const ram = new Uint8Array(512);
  const rom = new Uint8Array(256);

  if (romData) {
    // ROMデータをコピー
    rom.set(romData.subarray(0, 256));
    // 初期化時にROM(256Byte)からRAMの0番地に全部コピー
    ram.set(rom);
  }

  return {
    registers: [0, 0, 0, 0, 0, 0, 0, 0], // R0 to R7
    pc: 0,
    datr: 0,
    cr1: 0, // コントロールレジスタ1の初期値
    zf: false,
    ef: false,
    halted: false,
    ram,
    rom,
  };
};

// 初期実行状態を生成
export const initCPUExecutionState = (romData?: Uint8Array): CPUExecutionState => {
  return {
    cpu: initCPUState(romData),
    phase: 'FETCH',
    decoded: null,
    fetchBuffer: [],
    fetchedPhysAddrs: null,
    fetchedVirtAddrs: null,
    lastAccessedRamAddr: null,
    lastAccessedRomAddr: null,
    lastWriteRamAddr: null,
    addressTranslationLog: null,
  };
};

// DAT (動的アドレス変換) ロジック
export const translateAddress = (
  cpu: CPUState,
  virtualAddr: number
): {
  virtualAddr: number;
  physicalAddr: number | null;
  vpn: number;
  offset: number;
  valid: boolean;
  pfn: number | null;
  success: boolean;
} => {
  const vpn = (virtualAddr >> 6) & 0x03; // 上位2bit: 仮想ページ番号
  const offset = virtualAddr & 0x3F;     // 下位6bit: オフセット

  if (cpu.datr === 0) {
    // DAT無効: ストレートマッピング (0x000 ~ 0x0FF 物理)
    return {
      virtualAddr,
      physicalAddr: virtualAddr,
      vpn,
      offset,
      valid: true,
      pfn: null,
      success: true,
    };
  } else {
    // DAT有効: RAM上のページテーブル変換
    // ページテーブルは物理RAMの (cpu.cr1 * 64) から始まる4バイトに格納されている
    const tableAddr = (cpu.cr1 << 6) + vpn;
    const entryByte = cpu.ram[tableAddr];
    const valid = (entryByte & 0x80) !== 0; // 最上位ビットがVフラグ
    const pfn = entryByte & 0x07;           // 下位3ビットが物理フレーム番号 (0 ~ 7)

    if (valid) {
      const physicalAddr = (pfn << 6) | offset;
      return {
        virtualAddr,
        physicalAddr,
        vpn,
        offset,
        valid: true,
        pfn,
        success: true,
      };
    } else {
      // 変換例外 (ページフォルト)
      return {
        virtualAddr,
        physicalAddr: null,
        vpn,
        offset,
        valid: false,
        pfn,
        success: false,
      };
    }
  }
};

// オペランドのデコード処理 (バイナリ配列からオペランドの数値リストと文字列表現を生成)
export const decodeOperands = (
  operandType: string,
  bytes: number[],
  _cpu: CPUState
): { operands: number[]; operandText: string } => {
  if (bytes.length === 0) {
    return { operands: [], operandText: '' };
  }

  // 最初のバイトはOpcode、後続バイトがオペランド
  const args = bytes.slice(1);

  switch (operandType) {
    case 'none':
      return { operands: [], operandText: '' };

    case 'reg_reg': {
      // 2バイト目: [Rd: 4bit][Rs: 4bit]
      const rd = (args[0] >> 4) & 0x0F;
      const rs = args[0] & 0x0F;
      return {
        operands: [rd, rs],
        operandText: `R${rd}, R${rs}`,
      };
    }

    case 'reg_imm': {
      // 2バイト目: Rd (8bit), 3バイト目: imm8 (8bit)
      const rd = args[0] & 0xFF;
      const imm = args[1] & 0xFF;
      return {
        operands: [rd, imm],
        operandText: `R${rd}, ${imm}`,
      };
    }

    case 'reg_addr': {
      // 2バイト目: Rd (8bit), 3バイト目: addr8 (8bit)
      const rd = args[0] & 0xFF;
      const addr = args[1] & 0xFF;
      const hexAddr = `0x${addr.toString(16).toUpperCase().padStart(2, '0')}`;
      return {
        operands: [rd, addr],
        operandText: `R${rd}, [${hexAddr}]`,
      };
    }

    case 'addr_reg': {
      // 2バイト目: Rs (8bit), 3バイト目: addr8 (8bit)
      const rs = args[0] & 0xFF;
      const addr = args[1] & 0xFF;
      const hexAddr = `0x${addr.toString(16).toUpperCase().padStart(2, '0')}`;
      return {
        operands: [addr, rs],
        operandText: `[${hexAddr}], R${rs}`,
      };
    }

    case 'reg_ind': {
      // 2バイト目: [Rd: 4bit][Ra: 4bit]
      const rd = (args[0] >> 4) & 0x0F;
      const ra = args[0] & 0x0F;
      return {
        operands: [rd, ra],
        operandText: `R${rd}, [R${ra}]`,
      };
    }

    case 'ind_reg': {
      // 2バイト目: [Ra: 4bit][Rs: 4bit]
      const ra = (args[0] >> 4) & 0x0F;
      const rs = args[0] & 0x0F;
      return {
        operands: [ra, rs],
        operandText: `[R${ra}], R${rs}`,
      };
    }

    case 'addr': {
      // 2バイト目: addr8 (8bit)
      const addr = args[0] & 0xFF;
      const hexAddr = `0x${addr.toString(16).toUpperCase().padStart(2, '0')}`;
      return {
        operands: [addr],
        operandText: `${hexAddr}`,
      };
    }

    case 'page_frame': {
      // 2バイト目: [Page: 4bit][Frame: 4bit]
      const page = (args[0] >> 4) & 0x0F;
      const frame = args[0] & 0x0F;
      return {
        operands: [page, frame],
        operandText: `${page}, ${frame}`,
      };
    }

    case 'page': {
      // 2バイト目: Page (8bit)
      const page = args[0] & 0xFF;
      return {
        operands: [page],
        operandText: `${page}`,
      };
    }

    case 'cr_reg': {
      // 2バイト目: [Reserved: 4bit][Rs: 4bit]
      const rs = args[0] & 0x0F;
      return {
        operands: [rs],
        operandText: `CR1, R${rs}`,
      };
    }

    case 'reg': {
      // 2バイト目: Rs (8bit, R0-R7)
      const rs = args[0] & 0x0F;
      return {
        operands: [rs],
        operandText: `R${rs}`,
      };
    }

    default:
      return { operands: [], operandText: '' };
  }
};

// クロックステップ (FETCH -> DECODE -> EXECUTE を段階的に実行)
export const stepCPU = (execState: CPUExecutionState): CPUExecutionState => {
  // すでに停止または例外発生状態なら何もしない
  if (execState.cpu.halted || execState.cpu.ef) {
    return {
      ...execState,
      phase: execState.cpu.ef ? 'FAULT' : 'HALTED',
    };
  }

  const nextState = { ...execState, cpu: { ...execState.cpu } };
  nextState.cpu.registers = [...execState.cpu.registers];
  // RAMとROMは参照そのまま（破壊的変更を行うが、React状態遷移のためにシャローコピーは上位で行う）

  // アクセス履歴をリセット
  nextState.lastAccessedRamAddr = null;
  nextState.lastAccessedRomAddr = null;
  nextState.lastWriteRamAddr = null;
  nextState.addressTranslationLog = null;

  switch (execState.phase) {
    case 'FETCH': {
      const pc = nextState.cpu.pc;

      // PC (仮想アドレス) をDAT変換して物理アドレスを求める
      const trans = translateAddress(nextState.cpu, pc);
      nextState.addressTranslationLog = trans;
      nextState.lastAccessedRamAddr = trans.physicalAddr;

      if (!trans.success || trans.physicalAddr === null) {
        // 命令フェッチ中のDAT変換例外 (ページフォルト)
        nextState.cpu.ef = true;
        nextState.cpu.halted = true;
        nextState.phase = 'FAULT';
        return nextState;
      }

      // 物理RAMからオペコードをフェッチ
      const opcode = nextState.cpu.ram[trans.physicalAddr];

      const instDef = InstructionSet[opcode];
      if (!instDef) {
        // 未定義命令例外
        nextState.cpu.ef = true;
        nextState.cpu.halted = true;
        nextState.phase = 'FAULT';
        return nextState;
      }

      // 命令に必要なバイト数分、各バイトごとにDAT変換を適用してフェッチ
      const bytesToFetch = instDef.bytes;
      const fetchBuffer: number[] = [];
      const fetchedPhysAddrs: number[] = [];
      const fetchedVirtAddrs: number[] = [];
      for (let i = 0; i < bytesToFetch; i++) {
        const vAddr = (pc + i) & 0xFF;
        const t = translateAddress(nextState.cpu, vAddr);
        if (!t.success || t.physicalAddr === null) {
          nextState.cpu.ef = true;
          nextState.cpu.halted = true;
          nextState.phase = 'FAULT';
          return nextState;
        }
        fetchBuffer.push(nextState.cpu.ram[t.physicalAddr]);
        fetchedPhysAddrs.push(t.physicalAddr);
        fetchedVirtAddrs.push(vAddr);
      }

      // フェッチ完了時点でPCを次の命令の先頭へ進める (現実のCPUに準拠)
      // 分岐命令はEXECUTEフェーズでPCを絶対アドレスに上書きする
      nextState.cpu.pc = (pc + bytesToFetch) & 0xFF;

      nextState.fetchBuffer = fetchBuffer;
      nextState.fetchedPhysAddrs = fetchedPhysAddrs;
      nextState.fetchedVirtAddrs = fetchedVirtAddrs;
      nextState.decoded = null;
      nextState.phase = 'DECODE';
      break;
    }

    case 'DECODE': {
      const opcode = nextState.fetchBuffer[0];
      const instDef = InstructionSet[opcode];

      const { operands, operandText } = decodeOperands(
        instDef.operandType,
        nextState.fetchBuffer,
        nextState.cpu
      );

      const explanation = instDef.explain(operands);

      nextState.decoded = {
        opcode,
        mnemonic: instDef.mnemonic,
        bytes: instDef.bytes,
        operands,
        operandText,
        explanation,
      };

      nextState.phase = 'EXECUTE';
      break;
    }

    case 'EXECUTE': {
      if (!nextState.decoded) {
        nextState.phase = 'FETCH';
        break;
      }

      const decoded = nextState.decoded;
      const instDef = InstructionSet[decoded.opcode];

      // メモリアクセス時のヘルパーを用意
      const readMem = (virtualAddr: number): number => {
        const trans = translateAddress(nextState.cpu, virtualAddr);
        nextState.addressTranslationLog = trans;
        nextState.lastAccessedRamAddr = trans.physicalAddr;

        if (trans.success && trans.physicalAddr !== null) {
          return nextState.cpu.ram[trans.physicalAddr];
        } else {
          // DAT変換エラー
          nextState.cpu.ef = true;
          nextState.cpu.halted = true;
          return 0;
        }
      };

      const writeMem = (virtualAddr: number, val: number): boolean => {
        const trans = translateAddress(nextState.cpu, virtualAddr);
        nextState.addressTranslationLog = trans;

        if (trans.success && trans.physicalAddr !== null) {
          nextState.cpu.ram[trans.physicalAddr] = val & 0xFF;
          nextState.lastWriteRamAddr = trans.physicalAddr;
          nextState.lastAccessedRamAddr = trans.physicalAddr;
          return true;
        } else {
          // DAT変換エラー
          nextState.cpu.ef = true;
          nextState.cpu.halted = true;
          return false;
        }
      };

      // 実行前のPCはFETCHフェーズで既に次の命令の先頭へ進んでいる。
      // 分岐命令はexecute内でPCを絶対アドレスに上書きする。

      // 命令の実行
      instDef.execute(nextState.cpu, decoded.operands, { readMem, writeMem });

      // 実行後のステータスチェック
      if (nextState.cpu.ef) {
        nextState.phase = 'FAULT';
      } else if (nextState.cpu.halted) {
        nextState.phase = 'HALTED';
      } else {
        nextState.phase = 'FETCH';
        nextState.decoded = null;
        nextState.fetchBuffer = [];
        nextState.fetchedPhysAddrs = null;
        nextState.fetchedVirtAddrs = null;
      }
      break;
    }

    default:
      break;
  }

  return nextState;
};

// 1命令を実行 (FETCHから次のFETCHフェーズの直前まで一気に進める)
export const stepInstruction = (execState: CPUExecutionState): CPUExecutionState => {
  let state = execState;

  if (state.cpu.halted || state.cpu.ef) {
    return {
      ...state,
      phase: state.cpu.ef ? 'FAULT' : 'HALTED',
    };
  }

  // FETCHから始めて、次にFETCHフェーズに入る、または停止するまで回す
  state = stepCPU(state); // FETCH -> DECODE
  if (state.phase === 'DECODE') {
    state = stepCPU(state); // DECODE -> EXECUTE
  }
  if (state.phase === 'EXECUTE') {
    state = stepCPU(state); // EXECUTE -> FETCH/HALTED/FAULT
  }

  return state;
};
