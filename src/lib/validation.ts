import { parse, isValid, format } from 'date-fns';

export type DataType = 'Email' | 'Phone' | 'Date' | 'Number' | 'Boolean' | 'String';

// ─── Date Helpers ────────────────────────────────────────────────────────────

const DATE_FORMATS = [
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'MM/dd/yyyy',
  'dd/MM/yyyy',
  'yyyy/MM/dd',
  'MM-dd-yyyy',
  'yyyy-MM-dd HH:mm:ss',
  'yyyy/MM/dd HH:mm:ss',
  'dd-MM-yyyy HH:mm:ss',
  'MM/dd/yyyy HH:mm:ss',
  'dd/MM/yyyy HH:mm:ss',
];

/**
 * Checks if a string looks like it could be a date.
 * Must contain a separator (-, /) AND have a plausible structure.
 */
function looksLikeDate(s: string): boolean {
  // Must contain at least one date separator
  if (!/[-/]/.test(s)) return false;
  // Must have at least 2 separators or be a known text-month format
  const sepCount = (s.match(/[-/]/g) || []).length;
  if (sepCount >= 2) return true;
  // Text month formats like "April 5 2024"
  if (/[a-zA-Z]{3,}/.test(s) && /\d{1,4}/.test(s)) return true;
  return false;
}

function tryParseDate(str: string): Date | null {
  if (!str || str.length < 6) return null;

  // Try date-fns formats first (more reliable than native Date)
  for (const fmt of DATE_FORMATS) {
    const d = parse(str, fmt, new Date());
    if (isValid(d)) {
      // Sanity: year should be between 1900 and 2100
      const year = d.getFullYear();
      if (year >= 1900 && year <= 2100) return d;
    }
  }

  // Try native Date as fallback (handles "April 5 2024", "Jan 15, 2024", etc.)
  const native = new Date(str);
  if (!isNaN(native.getTime())) {
    const year = native.getFullYear();
    if (year >= 1900 && year <= 2100) return native;
  }

  return null;
}

export function normalizeDate(dateStr: string): string | null {
  const d = tryParseDate(dateStr);
  if (d) return format(d, 'yyyy-MM-dd HH:mm:ss');
  return null;
}

// ─── Type Detection ──────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', '1', '0']);

export function inferType(value: string): DataType {
  if (!value) return 'String';
  const trimmed = String(value).trim();
  if (trimmed === '') return 'String';

  // 1. Email — very specific pattern, check first
  if (EMAIL_RE.test(trimmed)) return 'Email';

  // 2. Boolean — small finite set, check early
  if (BOOLEAN_VALUES.has(trimmed.toLowerCase())) return 'Boolean';

  // 3. Date — check BEFORE Phone/Number because dates with digits can look like numbers
  //    Only attempt if the string structurally looks like a date
  if (looksLikeDate(trimmed)) {
    const parsed = tryParseDate(trimmed);
    if (parsed) return 'Date';
  }
  // Also catch text-month dates like "April 5 2024"
  if (/[a-zA-Z]{3,}/.test(trimmed) && /\d{1,4}/.test(trimmed)) {
    const parsed = tryParseDate(trimmed);
    if (parsed) return 'Date';
  }

  // 4. Phone — digits with formatting chars (+, -, parens, spaces). Must have
  //    at least one non-digit formatting character to distinguish from plain numbers.
  const digitsOnly = trimmed.replace(/\D/g, '');
  const hasPhoneFormatting = /[\+\(\)\-\s]/.test(trimmed);
  if (
    /^[\+\(\)\-\s\d]+$/.test(trimmed) &&
    hasPhoneFormatting &&
    digitsOnly.length >= 7 &&
    digitsOnly.length <= 15
  ) {
    return 'Phone';
  }

  // 5. Number — strip currency symbols and commas, then check
  const numCleaned = trimmed.replace(/,/g, '').replace(/^[\$€£₹]/, '').replace(/[\$€£₹]$/, '');
  if (numCleaned && !isNaN(Number(numCleaned))) return 'Number';

  return 'String';
}

// ─── Schema Inference ────────────────────────────────────────────────────────

export function inferSchema(rows: Record<string, unknown>[]): Record<string, DataType> {
  if (!rows || rows.length === 0) return {};

  const headers = Object.keys(rows[0]);
  const schema: Record<string, DataType> = {};

  headers.forEach(header => {
    const typeCounts: Record<DataType, number> = {
      'Email': 0, 'Phone': 0, 'Date': 0, 'Number': 0, 'Boolean': 0, 'String': 0
    };
    let nonEmptyCount = 0;

    rows.forEach(row => {
      const val = row[header];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        typeCounts[inferType(String(val))]++;
        nonEmptyCount++;
      }
    });

    if (nonEmptyCount === 0) {
      schema[header] = 'String';
      return;
    }

    // Find dominant type
    let dominant: DataType = 'String';
    let maxCount = 0;
    for (const [t, count] of Object.entries(typeCounts) as [DataType, number][]) {
      if (count > maxCount) {
        maxCount = count;
        dominant = t;
      }
    }

    // Need >50% agreement for a specific type; otherwise fallback to String
    schema[header] = (maxCount / nonEmptyCount > 0.5) ? dominant : 'String';
  });

  return schema;
}

// ─── Row Validation & Auto-Correction ────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean;
  isAutoCorrected: boolean;
  errors: string[];
  corrections: string[];
  cleanedRow: Record<string, unknown>;
}

export function validateRow(
  row: Record<string, unknown>,
  schema: Record<string, DataType>,
  rowIndex: number,
  columnStats: Record<string, { sum: number; count: number; lastValid: string }>
): ValidationResult {
  const corrections: string[] = [];
  const cleanedRow: Record<string, unknown> = {};

  for (const colName of Object.keys(row)) {
    const type = schema[colName] || 'String';
    const rawVal = row[colName];
    const strVal = (rawVal !== null && rawVal !== undefined) ? String(rawVal).trim() : '';
    const isEmpty = strVal === '';

    // Initialize column stats if needed
    if (!columnStats[colName]) {
      columnStats[colName] = { sum: 0, count: 0, lastValid: '' };
    }
    const stats = columnStats[colName];

    switch (type) {
      case 'Number': {
        if (isEmpty) {
          const uniqueNum = parseInt(`${Date.now()}${rowIndex}`.slice(-8));
          cleanedRow[colName] = uniqueNum;
          corrections.push(`'${colName}': filled empty → ${uniqueNum} (unique)`);
          break;
        }
        const cleaned = strVal.replace(/,/g, '').replace(/^[\$€£₹]/, '').replace(/[\$€£₹]$/, '');
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          cleanedRow[colName] = num;
          stats.sum += num;
          stats.count++;
          if (cleaned !== strVal) {
            corrections.push(`'${colName}': cleaned '${strVal}' → ${num}`);
          }
        } else {
          const match = strVal.match(/-?\d+(\.\d+)?/);
          if (match) {
            const extracted = parseFloat(match[0]);
            cleanedRow[colName] = extracted;
            stats.sum += extracted;
            stats.count++;
            corrections.push(`'${colName}': extracted ${match[0]} from '${strVal}'`);
          } else {
            const uniqueNum = parseInt(`${Date.now()}${rowIndex}`.slice(-8));
            cleanedRow[colName] = uniqueNum;
            corrections.push(`'${colName}': '${strVal}' → ${uniqueNum} (unique, no number found)`);
          }
        }
        break;
      }

      case 'Email': {
        if (isEmpty) {
          const generated = `user_${rowIndex}@placeholder.com`;
          cleanedRow[colName] = generated;
          corrections.push(`'${colName}': filled empty → '${generated}'`);
          break;
        }
        if (EMAIL_RE.test(strVal)) {
          cleanedRow[colName] = strVal.toLowerCase();
          stats.lastValid = strVal.toLowerCase();
        } else {
          // Try to fix common email issues
          let fixed = strVal.toLowerCase().replace(/\s/g, '');
          // Fix double @
          fixed = fixed.replace(/@{2,}/g, '@');
          // Fix missing dot in domain
          if (/@[^.]+$/.test(fixed)) {
            fixed += '.com';
          }
          if (EMAIL_RE.test(fixed)) {
            cleanedRow[colName] = fixed;
            corrections.push(`'${colName}': fixed '${strVal}' → '${fixed}'`);
            stats.lastValid = fixed;
          } else {
            const generated = `user_${rowIndex}@placeholder.com`;
            cleanedRow[colName] = generated;
            corrections.push(`'${colName}': replaced invalid '${strVal}' → '${generated}'`);
          }
        }
        break;
      }

      case 'Phone': {
        if (isEmpty) {
          cleanedRow[colName] = '0000000000';
          corrections.push(`'${colName}': filled empty → '0000000000'`);
          break;
        }
        const digits = strVal.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15) {
          cleanedRow[colName] = digits;
          stats.lastValid = digits;
          if (digits !== strVal) {
            corrections.push(`'${colName}': cleaned '${strVal}' → '${digits}'`);
          }
        } else if (digits.length > 0 && digits.length < 7) {
          // Pad short phone numbers
          const padded = digits.padEnd(10, '0');
          cleanedRow[colName] = padded;
          corrections.push(`'${colName}': padded short phone '${strVal}' → '${padded}'`);
        } else {
          cleanedRow[colName] = '0000000000';
          corrections.push(`'${colName}': replaced invalid '${strVal}' → '0000000000'`);
        }
        break;
      }

      case 'Date': {
        if (isEmpty) {
          const defaultDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
          cleanedRow[colName] = defaultDate;
          corrections.push(`'${colName}': filled empty → '${defaultDate}'`);
          break;
        }
        const normalized = normalizeDate(strVal);
        if (normalized) {
          cleanedRow[colName] = normalized;
          stats.lastValid = normalized;
          if (normalized !== strVal) {
            corrections.push(`'${colName}': normalized '${strVal}' → '${normalized}'`);
          }
        } else {
          const fallback = stats.lastValid || format(new Date(), 'yyyy-MM-dd HH:mm:ss');
          cleanedRow[colName] = fallback;
          corrections.push(`'${colName}': replaced unparseable '${strVal}' → '${fallback}'`);
        }
        break;
      }

      case 'Boolean': {
        if (isEmpty) {
          cleanedRow[colName] = 'False';
          corrections.push(`'${colName}': filled empty → 'False'`);
          break;
        }
        const lower = strVal.toLowerCase();
        if (['yes', 'true', '1', 'y', 't', 'on', 'active', 'enabled'].includes(lower)) {
          cleanedRow[colName] = 'True';
          if (strVal !== 'True') {
            corrections.push(`'${colName}': standardized '${strVal}' → 'True'`);
          }
        } else if (['no', 'false', '0', 'n', 'f', 'off', 'inactive', 'disabled'].includes(lower)) {
          cleanedRow[colName] = 'False';
          if (strVal !== 'False') {
            corrections.push(`'${colName}': standardized '${strVal}' → 'False'`);
          }
        } else {
          cleanedRow[colName] = 'False';
          corrections.push(`'${colName}': replaced invalid '${strVal}' → 'False'`);
        }
        break;
      }

      default: { // String
        if (isEmpty) {
          cleanedRow[colName] = 'N/A';
          corrections.push(`'${colName}': filled empty → 'N/A'`);
        } else {
          // Clean up: trim whitespace, remove control characters, normalize quotes
          const cleaned = strVal
            .replace(/[\x00-\x1F\x7F]/g, '') // remove control chars
            .replace(/\s{2,}/g, ' ');         // collapse multiple spaces
          cleanedRow[colName] = cleaned;
          if (cleaned !== strVal) {
            corrections.push(`'${colName}': cleaned whitespace/control chars`);
          }
        }
        break;
      }
    }
  }

  return {
    isValid: true,
    isAutoCorrected: corrections.length > 0,
    errors: [],
    corrections,
    cleanedRow
  };
}

