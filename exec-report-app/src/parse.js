const fs = require('fs');
const path = require('path');

/**
 * Minimal RFC4180-ish CSV parser (no external dependency needed).
 * Handles quoted fields, escaped quotes (""), commas/newlines inside quotes.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && next === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx].trim() : '';
    });
    return obj;
  });
}

const EXCEL_EXTS = ['.xlsx', '.xlsm', '.xls'];
const CSV_EXTS = ['.csv', '.tsv'];

/**
 * Parses an in-memory buffer given its file extension.
 * Returns an array of { fileName, sheetName, rows } — one entry per sheet (Excel) or one entry (CSV).
 */
function loadBuffer(buffer, ext, fileName) {
  ext = ext.toLowerCase();

  if (CSV_EXTS.includes(ext)) {
    const rows = parseCsv(buffer.toString('utf8'));
    return [{ fileName, sheetName: null, rows: rowsToObjects(rows) }];
  }

  if (EXCEL_EXTS.includes(ext)) {
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch (err) {
      throw new Error(
        `Reading ${ext} files requires the 'xlsx' package. Run "npm install" in this project folder, then try again.`
      );
    }
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.map(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      return { fileName, sheetName, rows: json };
    });
  }

  throw new Error(`Unsupported file type: ${ext} (expected .csv, .tsv, .xlsx, .xlsm, or .xls)`);
}

/**
 * Loads a file from disk (CLI usage). Delegates to loadBuffer.
 */
function loadFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  return loadBuffer(buffer, ext, fileName);
}

module.exports = { loadFile, loadBuffer, parseCsv, rowsToObjects };
