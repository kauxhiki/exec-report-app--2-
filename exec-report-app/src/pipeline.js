const path = require('path');
const { analyzeDataset } = require('./analyze');
const { renderReport } = require('./report');
const { sanitizeIdentifier, inferSchema, generateCreateTable, generateInserts } = require('./sql');

/**
 * @param {Array<{fileName: string, sheetName: string|null, rows: object[]}>} loadedSheets
 * @param {{ title?: string, sql?: boolean, sqlBatchSize?: number }} options
 * @returns {{ reportMarkdown: string, datasets: Array, sqlFiles: Array<{tableName, label, createSql, insertSql}> }}
 */
function runPipeline(loadedSheets, options = {}) {
  const title = options.title || 'Executive Report';
  const sqlBatchSize = options.sqlBatchSize || 500;

  const datasets = [];
  loadedSheets.forEach(({ fileName, sheetName, rows }) => {
    if (!rows || rows.length === 0) return;
    const label = sheetName ? `${fileName} (${sheetName})` : fileName;
    const analysis = analyzeDataset(rows);
    const baseName = path.basename(fileName, path.extname(fileName));
    const tableNameSource = sheetName ? `${baseName}_${sheetName}` : baseName;
    datasets.push({ label, analysis, rows, tableNameSource });
  });

  if (datasets.length === 0) {
    throw new Error('No usable data rows found in the provided file(s).');
  }

  const reportMarkdown = renderReport(datasets, title);

  let sqlFiles = [];
  if (options.sql) {
    sqlFiles = datasets
      .map(d => {
        const tableName = sanitizeIdentifier(d.tableNameSource, 'data_table');
        const schema = inferSchema(d.rows);
        if (schema.length === 0) return null;
        return {
          tableName,
          label: d.label,
          schema,
          createSql: generateCreateTable(tableName, schema),
          insertSql: generateInserts(tableName, schema, d.rows, sqlBatchSize),
        };
      })
      .filter(Boolean);
  }

  return { reportMarkdown, datasets, sqlFiles };
}

module.exports = { runPipeline };
