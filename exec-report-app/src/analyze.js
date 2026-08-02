const DATE_COL_HINTS = ['date', 'period', 'month', 'quarter', 'year', 'week', 'day'];

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function classifyColumns(rows) {
  if (rows.length === 0) return { numeric: [], period: null, categorical: [] };
  const headers = Object.keys(rows[0]);
  const numeric = [];
  const dateCandidates = [];
  const categorical = [];

  headers.forEach(h => {
    const values = rows.map(r => r[h]);
    const numericCount = values.filter(v => toNumber(v) !== null).length;
    const dateCount = values.filter(v => toDate(v) !== null).length;
    const distinct = new Set(values.map(v => String(v))).size;
    const nameLooksLikeDate = DATE_COL_HINTS.some(hint => h.toLowerCase().includes(hint));

    if (numericCount / values.length > 0.9) {
      numeric.push(h);
    } else if ((dateCount / values.length > 0.7) || (nameLooksLikeDate && dateCount / values.length > 0.4)) {
      dateCandidates.push({ col: h, score: dateCount / values.length + (nameLooksLikeDate ? 0.5 : 0) });
    } else if (distinct >= 2 && distinct <= Math.max(20, values.length * 0.5)) {
      categorical.push(h);
    }
  });

  dateCandidates.sort((a, b) => b.score - a.score);
  const period = dateCandidates.length > 0 ? dateCandidates[0].col : null;

  return { numeric, period, categorical: categorical.filter(c => c !== period) };
}

function periodKey(value) {
  const d = toDate(value);
  if (d) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return String(value);
}

function groupByPeriod(rows, periodCol, numericCols) {
  const groups = new Map();
  rows.forEach(r => {
    const key = periodKey(r[periodCol]);
    if (!groups.has(key)) {
      const zeroed = {};
      numericCols.forEach(c => (zeroed[c] = 0));
      groups.set(key, zeroed);
    }
    const g = groups.get(key);
    numericCols.forEach(c => {
      const n = toNumber(r[c]);
      if (n !== null) g[c] += n;
    });
  });
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([period, totals]) => ({ period, totals }));
}

function topContributors(rows, categoricalCol, metricCol, limit = 3) {
  const totals = new Map();
  rows.forEach(r => {
    const key = String(r[categoricalCol]);
    const n = toNumber(r[metricCol]) || 0;
    totals.set(key, (totals.get(key) || 0) + n);
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

/**
 * Analyzes one dataset (rows from a single file/sheet).
 * Returns a structured summary: column roles, period-over-period totals, overall totals, top contributors.
 */
function analyzeDataset(rows) {
  const { numeric, period, categorical } = classifyColumns(rows);

  const overallTotals = {};
  numeric.forEach(c => {
    overallTotals[c] = rows.reduce((sum, r) => sum + (toNumber(r[c]) || 0), 0);
  });

  let byPeriod = null;
  let comparison = null;
  if (period && numeric.length > 0) {
    byPeriod = groupByPeriod(rows, period, numeric);
    if (byPeriod.length >= 2) {
      const current = byPeriod[byPeriod.length - 1];
      const prior = byPeriod[byPeriod.length - 2];
      comparison = numeric.map(c => {
        const currVal = current.totals[c];
        const priorVal = prior.totals[c];
        const pctChange = priorVal !== 0 ? ((currVal - priorVal) / Math.abs(priorVal)) * 100 : null;
        return {
          metric: c,
          current: currVal,
          prior: priorVal,
          pctChange,
          currentPeriodLabel: current.period,
          priorPeriodLabel: prior.period,
        };
      });
    }
  }

  let topDrivers = null;
  if (categorical.length > 0 && numeric.length > 0) {
    const bestNumeric = comparison
      ? [...comparison].sort((a, b) => Math.abs(b.pctChange || 0) - Math.abs(a.pctChange || 0))[0].metric
      : numeric[0];
    topDrivers = {
      metric: bestNumeric,
      breakdownCol: categorical[0],
      top: topContributors(rows, categorical[0], bestNumeric),
    };
  }

  return {
    rowCount: rows.length,
    columns: { numeric, period, categorical },
    overallTotals,
    byPeriod,
    comparison,
    topDrivers,
  };
}

module.exports = { analyzeDataset, toNumber, toDate };
