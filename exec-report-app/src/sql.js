function sanitizeIdentifier(name, fallback = 'col') {
  let s = String(name || '').trim().toLowerCase();
  s = s.replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (s === '') s = fallback;
  if (/^[0-9]/.test(s)) s = `${fallback}_${s}`;
  return s;
}

function dedupeIdentifiers(names) {
  const seen = new Map();
  return names.map(n => {
    if (!seen.has(n)) {
      seen.set(n, 1);
      return n;
    }
    const count = seen.get(n) + 1;
    seen.set(n, count);
    return `${n}_${count}`;
  });
}

function isIntegerStr(v) {
  return /^-?\d+$/.test(String(v).trim());
}

function isDecimalStr(v) {
  const cleaned = String(v).replace(/[$,%\s]/g, '');
  return cleaned !== '' && cleaned !== '-' && !isNaN(Number(cleaned));
}

function isDateStr(v) {
  const s = String(v).trim();
  if (s === '') return false;
  // Require a reasonably date-like shape to avoid misclassifying plain numbers/text
  if (!/\d{4}-\d{1,2}-\d{1,2}/.test(s) && !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function hasTimeComponent(v) {
  return /\d{1,2}:\d{2}/.test(String(v));
}

function inferColumnType(values) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmpty.length === 0) return { type: 'VARCHAR(255)', kind: 'string' };

  const total = nonEmpty.length;
  const dateCount = nonEmpty.filter(isDateStr).length;
  if (dateCount / total > 0.9) {
    const withTime = nonEmpty.filter(hasTimeComponent).length;
    return withTime / total > 0.3 ? { type: 'DATETIME', kind: 'datetime' } : { type: 'DATE', kind: 'date' };
  }

  const intCount = nonEmpty.filter(isIntegerStr).length;
  if (intCount / total > 0.95) {
    const maxAbs = Math.max(...nonEmpty.map(v => Math.abs(Number(v))));
    const type = maxAbs > 2147483647 ? 'BIGINT' : 'INT';
    return { type, kind: 'int' };
  }

  const decCount = nonEmpty.filter(isDecimalStr).length;
  if (decCount / total > 0.95) {
    return { type: 'DECIMAL(18,4)', kind: 'decimal' };
  }

  const maxLen = Math.max(...nonEmpty.map(v => String(v).length));
  if (maxLen > 1000) return { type: 'TEXT', kind: 'string' };
  const bucket = [50, 100, 255, 500, 1000].find(b => maxLen <= b) || 1000;
  return { type: `VARCHAR(${bucket})`, kind: 'string' };
}

/**
 * Builds a schema from row objects: [{ originalName, sqlName, type, kind }]
 */
function inferSchema(rows) {
  if (rows.length === 0) return [];
  const originalNames = Object.keys(rows[0]);
  const sqlNames = dedupeIdentifiers(originalNames.map(n => sanitizeIdentifier(n)));

  return originalNames.map((originalName, idx) => {
    const values = rows.map(r => r[originalName]);
    const { type, kind } = inferColumnType(values);
    return { originalName, sqlName: sqlNames[idx], type, kind };
  });
}

function generateCreateTable(tableName, schema) {
  const cols = schema.map(c => `  \`${c.sqlName}\` ${c.type}`).join(',\n');
  return `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${cols}\n);\n`;
}

function escapeStringValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatValue(v, kind) {
  if (v === null || v === undefined || String(v).trim() === '') return 'NULL';
  const s = String(v).trim();
  if (kind === 'int') return String(parseInt(s.replace(/[$,\s]/g, ''), 10));
  if (kind === 'decimal') return String(Number(s.replace(/[$,%\s]/g, '')));
  if (kind === 'date') {
    const d = new Date(s);
    return `'${d.toISOString().split('T')[0]}'`;
  }
  if (kind === 'datetime') {
    const d = new Date(s);
    return `'${d.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  return `'${escapeStringValue(s)}'`;
}

function generateInserts(tableName, schema, rows, batchSize = 500) {
  const colList = schema.map(c => `\`${c.sqlName}\``).join(', ');
  const statements = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valueRows = batch.map(row => {
      const vals = schema.map(c => formatValue(row[c.originalName], c.kind));
      return `(${vals.join(', ')})`;
    });
    statements.push(`INSERT INTO \`${tableName}\` (${colList}) VALUES\n${valueRows.join(',\n')};`);
  }

  return statements.join('\n\n') + '\n';
}

module.exports = { sanitizeIdentifier, inferSchema, generateCreateTable, generateInserts };
