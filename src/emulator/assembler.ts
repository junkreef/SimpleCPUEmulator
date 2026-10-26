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
  addressToLineMap: Record<number, number>;
  lineToAddressMap: Record<number, number>;
}

// 数値または16進数のパース
const parseNumber = (str: string): number => {
  if (str.toLowerCase().startsWith('0x')) {
    return parseInt(str.slice(2), 16);
  }
  return parseInt(str, 10);
};

// ラベル名（識別子）かどうかの判定
const isIdentifier = (str: string): boolean => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str);

// アドレス系オペランド（数値リテラル または ラベル/変数名）を解決する
const resolveAddr = (
  target: string,
  labelMap: Record<string, number>
): { value: number; err?: string } => {
  if (isIdentifier(target)) {
    if (labelMap[target] !== undefined) {
      return { value: labelMap[target] & 0xFF };
    }
    return { value: 0, err: `定義されていないラベル/変数です: ${target}` };
  }
  return { value: parseNumber(target) & 0xFF };
};

// DS擬似命令で確保するストレージのサイズ（バイト数）を解析する。
// 書式: [反復数]型[L長さ]  例) X / XL16 / 8X / 3CL2
const parseDSOperand = (operandStr: string): { bytes: number; err?: string } => {
  const m = operandStr.match(/^(\d+)?([a-zA-Z])(?:L(\d+))?$/);
  if (!m) {
    return {
      bytes: 0,
      err: `DSのオペランド書式が不正です: "${operandStr}"（例: X, XL16, 8X, 3CL2）`,
    };
  }
  const dup = m[1] !== undefined ? parseInt(m[1], 10) : 1;
  const type = m[2].toUpperCase();
  // 本CPUは8ビット（バイト）マシンのため、サポートする型は X / C（いずれも要素長1バイト）。
  const impliedLength: Record<string, number> = { X: 1, C: 1 };
  if (impliedLength[type] === undefined) {
    return {
      bytes: 0,
      err: `DSでサポートされていない型です: "${type}"（使用可能: X, C）`,
    };
  }
  const length = m[3] !== undefined ? parseInt(m[3], 10) : impliedLength[type];
  const total = dup * length;
  if (total <= 0) {
    return { bytes: 0, err: `DSで確保するサイズが0以下です: "${operandStr}"` };
  }
  return { bytes: total };
};

// DC擬似命令の初期値をバイト列に変換する。
// 書式: [反復数]型[L長さ]'初期値' をカンマで並べる  例) X'2A' / X'01,02,FF' / CL8'ABC' / C'HELLO',X'00'
const parseDCOperand = (operandStr: string): { bytes: number[]; err?: string } => {
  const bytes: number[] = [];
  let rest = operandStr;

  while (true) {
    const head = rest.match(/^(\d+)?([a-zA-Z])(?:L(\d+))?'/);
    if (!head) {
      return {
        bytes: [],
        err: `DCのオペランド書式が不正です: "${operandStr}"（例: X'2A', X'01,02', C'HELLO', C'HI',X'00'）`,
      };
    }
    const dup = head[1] !== undefined ? parseInt(head[1], 10) : 1;
    const type = head[2].toUpperCase();
    const length = head[3] !== undefined ? parseInt(head[3], 10) : undefined;

    // 閉じ引用符までを初期値として読む（'' は ' 1文字を表す）
    let nominal = '';
    let i = head[0].length;
    let closed = false;
    while (i < rest.length) {
      if (rest[i] === "'") {
        if (rest[i + 1] === "'") {
          nominal += "'";
          i += 2;
          continue;
        }
        closed = true;
        i++;
        break;
      }
      nominal += rest[i];
      i++;
    }
    if (!closed) {
      return { bytes: [], err: `DCの初期値に閉じ引用符 ' がありません: "${operandStr}"` };
    }
    if (length !== undefined && length <= 0) {
      return { bytes: [], err: `DCの長さ指定は1以上にしてください: "${operandStr}"` };
    }

    // 1要素分のバイト列を作る
    let unit: number[] = [];
    if (type === 'X') {
      // 16進数。カンマ区切りで複数の値を並べられる。長さ指定時は左側をゼロ詰め／切り捨て。
      for (const item of nominal.split(',')) {
        const hex = item.trim();
        if (!/^[0-9A-Fa-f]+$/.test(hex)) {
          return { bytes: [], err: `DCのX型の初期値は16進数で書いてください: "${item}"` };
        }
        const padded = hex.length % 2 === 1 ? '0' + hex : hex;
        let value: number[] = [];
        for (let p = 0; p < padded.length; p += 2) {
          value.push(parseInt(padded.slice(p, p + 2), 16));
        }
        if (length !== undefined) {
          value = value.length >= length
            ? value.slice(value.length - length)
            : [...new Array(length - value.length).fill(0), ...value];
        }
        unit.push(...value);
      }
    } else if (type === 'C') {
      // 文字列（ASCII）。長さ指定時は右側を空白(0x20)で埋める／切り捨て。
      if (nominal === '') {
        return { bytes: [], err: `DCのC型の初期値が空です: "${operandStr}"` };
      }
      for (const ch of nominal) {
        const code = ch.charCodeAt(0);
        if (ch.length !== 1 || code > 0x7F) {
          return { bytes: [], err: `DCのC型に使えるのはASCII文字だけです: "${ch}"` };
        }
        unit.push(code);
      }
      if (length !== undefined) {
        unit = unit.length >= length
          ? unit.slice(0, length)
          : [...unit, ...new Array(length - unit.length).fill(0x20)];
      }
    } else {
      return { bytes: [], err: `DCでサポートされていない型です: "${type}"（使用可能: X, C）` };
    }

    if (bytes.length + dup * unit.length > 256) {
      return { bytes: [], err: `DCの初期値が256バイトを超えています: "${operandStr}"` };
    }
    for (let d = 0; d < dup; d++) bytes.push(...unit);

    // 次のオペランド（カンマ区切り）へ
    rest = rest.slice(i).trimStart();
    if (rest === '') break;
    if (!rest.startsWith(',')) {
      return { bytes: [], err: `DCのオペランドの区切りが不正です（カンマで区切ってください）: "${operandStr}"` };
    }
    rest = rest.slice(1).trimStart();
  }

  if (bytes.length === 0) {
    return { bytes: [], err: `DCで定義するサイズが0です: "${operandStr}"` };
  }
  return { bytes };
};

// コメント除去（セミコロン以降を捨てる）。ただし DC の '...' 内のセミコロンは文字として残す。
const stripComment = (line: string): string => {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") inQuote = !inQuote;
    else if (line[i] === ';' && !inQuote) return line.slice(0, i);
  }
  return line;
};

// オペランドパース用の正規表現マッピング
const OperandRegex: Record<OperandType, RegExp> = {
  none: /^\s*$/,
  reg_reg: /^\s*R([0-7])\s*,\s*R([0-7])\s*$/i,
  reg_imm: /^\s*R([0-7])\s*,\s*(0x[0-9A-F]+|-?[0-9]+|[a-zA-Z_][a-zA-Z0-9_]*)\s*$/i,
  reg_addr: /^\s*R([0-7])\s*,\s*\[\s*(0x[0-9A-F]+|[0-9]+|(?!R[0-7]\s*\])[a-zA-Z_][a-zA-Z0-9_]*)\s*\]\s*$/i,
  addr_reg: /^\s*\[\s*(0x[0-9A-F]+|[0-9]+|(?!R[0-7]\s*\])[a-zA-Z_][a-zA-Z0-9_]*)\s*\]\s*,\s*R([0-7])\s*$/i,
  reg_ind: /^\s*R([0-7])\s*,\s*\[\s*R([0-7])\s*\]\s*$/i,
  ind_reg: /^\s*\[\s*R([0-7])\s*\]\s*,\s*R([0-7])\s*$/i,
  addr: /^\s*([a-zA-Z_][a-zA-Z0-9_]*|0x[0-9A-F]+|[0-9]+)\s*$/i, // ラベルまたは数値
  page_frame: /^\s*([0-3])\s*,\s*([0-7])\s*$/i,
  page: /^\s*([0-3])\s*$/i,
  cr_reg: /^\s*CR1\s*,\s*R([0-7])\s*$/i,
  reg: /^\s*R([0-7])\s*$/i, // <--- Single register indirect branch target
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
      const resolved = resolveAddr(matches[2], labelMap);
      if (resolved.err) return { bytes: [], err: resolved.err };
      bytes.push(rd, resolved.value);
      return { bytes };
    }

    case 'addr_reg': {
      const resolved = resolveAddr(matches[1], labelMap);
      if (resolved.err) return { bytes: [], err: resolved.err };
      const rs = parseInt(matches[2], 10);
      bytes.push(rs, resolved.value); // Opcode後続バイト: [Rs][Addr]
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

    case 'reg': {
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
  const addressToLineMap: Record<number, number> = {};
  const lineToAddressMap: Record<number, number> = {};

  const lines = sourceCode.split('\n');
  const parsedLines: ParsedLine[] = [];

  // --- パス0: 各行のパースとコメント除去、ラベル・命令の分離 ---
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;

    // コメント除去 (セミコロン以降を捨てる)
    const withoutComment = stripComment(rawLine).trim();
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
    return { success: false, rom, errors, labelMap, addressToLineMap, lineToAddressMap };
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
      // DS擬似命令: ストレージ領域を確保する（実命令ではない）
      if (pl.mnemonic === 'DS') {
        const ds = parseDSOperand(pl.operandStr ?? '');
        if (ds.err) {
          errors.push({ line: pl.lineNumber, text: pl.originalText, message: ds.err });
          continue;
        }
        currentAddress += ds.bytes;
        continue;
      }

      // DC擬似命令: 初期値付きの定数領域を定義する（実命令ではない）
      if (pl.mnemonic === 'DC') {
        const dc = parseDCOperand(pl.operandStr ?? '');
        if (dc.err) {
          errors.push({ line: pl.lineNumber, text: pl.originalText, message: dc.err });
          continue;
        }
        currentAddress += dc.bytes.length;
        continue;
      }

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
    return { success: false, rom, errors, labelMap, addressToLineMap, lineToAddressMap };
  }

  // --- パス2: バイナリへのエンコードと書き込み ---
  let writePtr = 0;
  for (const pl of parsedLines) {
    if (!pl.mnemonic) continue;

    // DS擬似命令: 確保分だけ書き込み位置を進める（ROMはゼロ初期化のまま＝ストレージ予約）
    if (pl.mnemonic === 'DS') {
      const ds = parseDSOperand(pl.operandStr ?? '');
      if (ds.err) {
        errors.push({ line: pl.lineNumber, text: pl.originalText, message: ds.err });
        continue;
      }
      if (writePtr + ds.bytes > 256) {
        errors.push({
          line: pl.lineNumber,
          text: pl.originalText,
          message: `ROMの最大容量（256バイト）を超過しました（現在: ${writePtr + ds.bytes}バイト）。`,
        });
        break;
      }
      // データ領域の先頭アドレスと行を対応づけておく
      addressToLineMap[writePtr] = pl.lineNumber;
      lineToAddressMap[pl.lineNumber] = writePtr;
      writePtr += ds.bytes;
      continue;
    }

    // DC擬似命令: 初期値のバイト列をそのままROMに書き込む
    if (pl.mnemonic === 'DC') {
      const dc = parseDCOperand(pl.operandStr ?? '');
      if (dc.err) {
        errors.push({ line: pl.lineNumber, text: pl.originalText, message: dc.err });
        continue;
      }
      if (writePtr + dc.bytes.length > 256) {
        errors.push({
          line: pl.lineNumber,
          text: pl.originalText,
          message: `ROMの最大容量（256バイト）を超過しました（現在: ${writePtr + dc.bytes.length}バイト）。`,
        });
        break;
      }
      addressToLineMap[writePtr] = pl.lineNumber;
      lineToAddressMap[pl.lineNumber] = writePtr;
      rom.set(dc.bytes, writePtr);
      writePtr += dc.bytes.length;
      continue;
    }

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

    // 双方向行マップを記録
    addressToLineMap[writePtr] = pl.lineNumber;
    lineToAddressMap[pl.lineNumber] = writePtr;

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
    addressToLineMap,
    lineToAddressMap,
  };
};
