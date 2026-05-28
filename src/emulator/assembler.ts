import { MnemonicMap } from './instructionSet';
import { OperandType, InstructionDef } from './types';

export interface AssembleError {
  line: number;
  text: string;
  message: string;
}

export interface AssembleResult {
  success: boolean;
  rom: Uint8Array;
  errors: AssembleError[];
  labelMap: Record<string, number>;
}

// 数値または16進数のパース
const parseNumber = (str: string): number => {
  if (str.toLowerCase().startsWith('0x')) {
    return parseInt(str.slice(2), 16);
  }
  return parseInt(str, 10);
};

// オペランドパース用の正規表現マッピング
const OperandRegex: Record<OperandType, RegExp> = {
  none: /^\s*$/,
  reg_reg: /^\s*R([0-3])\s*,\s*R([0-3])\s*$/i,
  reg_imm: /^\s*R([0-3])\s*,\s*(0x[0-9A-F]+|-?[0-9]+|[a-zA-Z_][a-zA-Z0-9_]*)\s*$/i,
  reg_addr: /^\s*R([0-3])\s*,\s*\[\s*(0x[0-9A-F]+|[0-9]+)\s*\]\s*$/i,
  addr_reg: /^\s*\[\s*(0x[0-9A-F]+|[0-9]+)\s*\]\s*,\s*R([0-3])\s*$/i,
  reg_ind: /^\s*R([0-3])\s*,\s*\[\s*R([0-3])\s*\]\s*$/i,
  ind_reg: /^\s*\[\s*R([0-3])\s*\]\s*,\s*R([0-3])\s*$/i,
  addr: /^\s*([a-zA-Z_][a-zA-Z0-9_]*|0x[0-9A-F]+|[0-9]+)\s*$/i, // ラベルまたは数値
  page_frame: /^\s*([0-3])\s*,\s*([0-7])\s*$/i,
  page: /^\s*([0-3])\s*$/i,
  cr_reg: /^\s*CR1\s*,\s*R([0-3])\s*$/i,
};

// パースされた文字列引数をバイナリバイト列にエンコードする
const encodeOperands = (
  type: OperandType,
  matches: string[],
  labelMap: Record<string, number>
): { bytes: number[]; err?: string } => {
  const bytes: number[] = [];

  switch (type) {
    case 'none':
      return { bytes: [] };

    case 'reg_reg': {
      const rd = parseInt(matches[1], 10);
      const rs = parseInt(matches[2], 10);
      bytes.push((rd << 4) | rs);
      return { bytes };
    }

    case 'reg_imm': {
      const rd = parseInt(matches[1], 10);
      const target = matches[2];
      let imm = 0;
      if (target.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        if (labelMap[target] !== undefined) {
          imm = labelMap[target];
        } else {
          return { bytes: [], err: `定義されていないラベルです: ${target}` };
        }
      } else {
        imm = parseNumber(target);
      }
      bytes.push(rd, imm & 0xFF);
      return { bytes };
    }

    case 'reg_addr': {
      const rd = parseInt(matches[1], 10);
      const addr = parseNumber(matches[2]) & 0xFF;
      bytes.push(rd, addr);
      return { bytes };
    }

    case 'addr_reg': {
      const addr = parseNumber(matches[1]) & 0xFF;
      const rs = parseInt(matches[2], 10);
      bytes.push(rs, addr); // Opcode後続バイト: [Rs][Addr]
      return { bytes };
    }

    case 'reg_ind': {
      const rd = parseInt(matches[1], 10);
      const ra = parseInt(matches[2], 10);
      bytes.push((rd << 4) | ra);
      return { bytes };
    }

    case 'ind_reg': {
      const ra = parseInt(matches[1], 10);
      const rs = parseInt(matches[2], 10);
      bytes.push((ra << 4) | rs);
      return { bytes };
    }

    case 'addr': {
      const target = matches[1];
      let addr = 0;
      if (target.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        // ラベル
        if (labelMap[target] !== undefined) {
          addr = labelMap[target];
        } else {
          return { bytes: [], err: `定義されていないラベルです: ${target}` };
        }
      } else {
        // 数値
        addr = parseNumber(target);
      }
      bytes.push(addr & 0xFF);
      return { bytes };
    }

    case 'page_frame': {
      const page = parseInt(matches[1], 10);
      const frame = parseInt(matches[2], 10);
      bytes.push((page << 4) | frame);
      return { bytes };
    }

    case 'page': {
      const page = parseInt(matches[1], 10);
      bytes.push(page & 0xFF);
      return { bytes };
    }

    case 'cr_reg': {
      const rs = parseInt(matches[1], 10);
      bytes.push(rs & 0x0F);
      return { bytes };
    }

    default:
      return { bytes: [], err: `未知のオペランドタイプです: ${type}` };
  }
};

interface ParsedLine {
  originalText: string;
  lineNumber: number;
  mnemonic?: string;
  operandStr?: string;
  label?: string;
}

export const assemble = (sourceCode: string): AssembleResult => {
  const errors: AssembleError[] = [];
  const labelMap: Record<string, number> = {};
  const rom = new Uint8Array(256);

  const lines = sourceCode.split('\n');
  const parsedLines: ParsedLine[] = [];

  // --- パス0: 各行のパースとコメント除去、ラベル・命令の分離 ---
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;

    // コメント除去 (セミコロン以降を捨てる)
    const withoutComment = rawLine.split(';')[0].trim();
    if (withoutComment === '') continue; // 空行

    let remaining = withoutComment;
    let label: string | undefined;

    // ラベルの検出 (例: "loop:")
    const labelMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
    if (labelMatch) {
      label = labelMatch[1];
      remaining = remaining.slice(labelMatch[0].length).trim();
    }

    // 命令とオペランドの分離 (例: "LOAD R0, 10")
    if (remaining === '') {
      // ラベルだけの行
      parsedLines.push({ originalText: rawLine, lineNumber, label });
    } else {
      const instMatch = remaining.match(/^([a-zA-Z]+)\s*(.*)$/);
      if (instMatch) {
        const mnemonic = instMatch[1].toUpperCase();
        const operandStr = instMatch[2].trim();
        parsedLines.push({ originalText: rawLine, lineNumber, label, mnemonic, operandStr });
      } else {
        errors.push({
          line: lineNumber,
          text: rawLine,
          message: `無効な行構成です。`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, rom, errors, labelMap };
  }

  // --- パス1: アドレスの割当とラベルマップの構築 ---
  let currentAddress = 0;
  for (const pl of parsedLines) {
    if (pl.label) {
      if (labelMap[pl.label] !== undefined) {
        errors.push({
          line: pl.lineNumber,
          text: pl.originalText,
          message: `ラベル「${pl.label}」が重複して定義されています。`,
        });
        continue;
      }
      labelMap[pl.label] = currentAddress;
    }

    if (pl.mnemonic) {
      const defs = MnemonicMap[pl.mnemonic];
      if (!defs || defs.length === 0) {
        errors.push({
          line: pl.lineNumber,
          text: pl.originalText,
          message: `未知の命令（ニーモニック）です: ${pl.mnemonic}`,
        });
        continue;
      }

      // 引数のパターンがどれにマッチするかを一時的に判別して、その命令のバイト数を足す。
      // 最も多く引数が必要な定義に合うものを仮で選ぶか、あるいはオペランド構造に合わせて正確に判定する。
      let matchedDef: InstructionDef | null = null;
      for (const def of defs) {
        const regex = OperandRegex[def.operandType];
        if (pl.operandStr !== undefined && regex.test(pl.operandStr)) {
          matchedDef = def;
          break;
        }
      }

      // もし正確なマッチングがなければ、ニーモニックの最初の定義のバイト数を仮置きするか、エラーにする。
      // ここでは、ラベル解決の正確性のため、オペランドが文法的にマッチするものを探す。
      if (matchedDef) {
        currentAddress += matchedDef.bytes;
      } else {
        // ラベルは未解決かもしれないので、ラベル判定を緩めた正規表現で再チェックする
        // (特に 'addr' タイプはターゲットがまだ解決されていないラベルである可能性がある)
        let foundFallback = false;
        for (const def of defs) {
          if (def.operandType === 'addr' && pl.operandStr?.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
            matchedDef = def;
            currentAddress += def.bytes;
            foundFallback = true;
            break;
          }
        }
        if (!foundFallback) {
          errors.push({
            line: pl.lineNumber,
            text: pl.originalText,
            message: `命令「${pl.mnemonic}」の引数が無効です: "${pl.operandStr}"`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, rom, errors, labelMap };
  }

  // --- パス2: バイナリへのエンコードと書き込み ---
  let writePtr = 0;
  for (const pl of parsedLines) {
    if (!pl.mnemonic) continue;

    const defs = MnemonicMap[pl.mnemonic];
    let matchedDef: InstructionDef | null = null;
    let matchResult: RegExpMatchArray | null = null;

    for (const def of defs) {
      const regex = OperandRegex[def.operandType];
      const match = pl.operandStr !== undefined ? pl.operandStr.match(regex) : null;
      if (match) {
        matchedDef = def;
        matchResult = match;
        break;
      }
    }

    // ラベルへのジャンプ用フォールバック
    if (!matchedDef) {
      for (const def of defs) {
        if (def.operandType === 'addr' && pl.operandStr?.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
          matchedDef = def;
          // ダミーマッチを生成
          matchResult = [pl.operandStr, pl.operandStr] as any;
          break;
        }
      }
    }

    if (!matchedDef || !matchResult) {
      errors.push({
        line: pl.lineNumber,
        text: pl.originalText,
        message: `命令のオペランドがパースできません: ${pl.mnemonic} ${pl.operandStr}`,
      });
      continue;
    }

    // オペランドをバイナリバイト列にエンコード
    const enc = encodeOperands(matchedDef.operandType, matchResult, labelMap);
    if (enc.err) {
      errors.push({
        line: pl.lineNumber,
        text: pl.originalText,
        message: enc.err,
      });
      continue;
    }

    // ROMの最大容量チェック
    if (writePtr + matchedDef.bytes > 256) {
      errors.push({
        line: pl.lineNumber,
        text: pl.originalText,
        message: `ROMの最大容量（256バイト）を超過しました（現在: ${writePtr + matchedDef.bytes}バイト）。`,
      });
      break;
    }

    // ROMへの書き込み
    rom[writePtr] = matchedDef.opcode;
    for (let b = 0; b < enc.bytes.length; b++) {
      rom[writePtr + 1 + b] = enc.bytes[b];
    }

    writePtr += matchedDef.bytes;
  }

  return {
    success: errors.length === 0,
    rom,
    errors,
    labelMap,
  };
};
