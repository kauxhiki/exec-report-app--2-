function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function fmtPct(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return 'N/A';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

function trendArrow(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return '→';
  if (p > 1) return '↑';
  if (p < -1) return '↓';
  return '→';
}

function buildHeadline(datasets) {
  const withComparison = datasets.filter(d => d.analysis.comparison);
  if (withComparison.length === 0) {
    return 'This report summarizes the totals below. No period-over-period comparison was available (add a date/period column across at least two periods for trend analysis).';
  }
  let biggest = null;
  withComparison.forEach(d => {
    d.analysis.comparison.forEach(c => {
      if (c.pctChange === null) return;
      if (!biggest || Math.abs(c.pctChange) > Math.abs(biggest.pctChange)) {
        biggest = { ...c, source: d.label };
      }
    });
  });
  if (!biggest) {
    return 'This report summarizes the totals below across the available periods.';
  }
  const direction = biggest.pctChange >= 0 ? 'up' : 'down';
  return `**${biggest.metric}** is ${direction} **${fmtPct(Math.abs(biggest.pctChange))}** (${fmtNum(biggest.prior)} → ${fmtNum(biggest.current)}) from ${biggest.priorPeriodLabel} to ${biggest.currentPeriodLabel} in ${biggest.source}, the largest move in this dataset.`;
}

function buildMetricsTable(datasets) {
  const lines = ['| Source | Metric | Prior | Current | Change | Trend |', '|---|---|---|---|---|---|'];
  let any = false;
  datasets.forEach(d => {
    if (!d.analysis.comparison) return;
    d.analysis.comparison.forEach(c => {
      any = true;
      lines.push(
        `| ${d.label} | ${c.metric} | ${fmtNum(c.prior)} | ${fmtNum(c.current)} | ${fmtPct(c.pctChange)} | ${trendArrow(c.pctChange)} |`
      );
    });
  });
  return any ? lines.join('\n') : '_No period-over-period data available._';
}

function buildDrivers(datasets) {
  const bullets = [];
  datasets.forEach(d => {
    const td = d.analysis.topDrivers;
    if (td && td.top.length > 0) {
      const list = td.top.map(t => `${t.name} (${fmtNum(t.value)})`).join(', ');
      bullets.push(`- In **${d.label}**, ${td.breakdownCol} breakdown for **${td.metric}** is led by: ${list}.`);
    }
    if (d.analysis.comparison) {
      d.analysis.comparison.forEach(c => {
        if (c.pctChange !== null && Math.abs(c.pctChange) > 20) {
          const dir = c.pctChange > 0 ? 'jumped' : 'dropped';
          bullets.push(`- **${c.metric}** in **${d.label}** ${dir} ${fmtPct(Math.abs(c.pctChange))} — worth confirming whether this is a one-off or a trend.`);
        }
      });
    }
  });
  if (bullets.length === 0) {
    bullets.push('- No standout drivers detected from the available columns. Add a categorical column (e.g., region, product, team) for breakdown analysis.');
  }
  return bullets.join('\n');
}

function buildRisks(datasets) {
  const bullets = [];
  datasets.forEach(d => {
    if (!d.analysis.comparison) return;
    d.analysis.comparison.forEach(c => {
      if (c.pctChange !== null && c.pctChange < -10) {
        bullets.push(`- **${c.metric}** (${d.label}) declined ${fmtPct(Math.abs(c.pctChange))} — flag for review.`);
      }
    });
  });
  if (bullets.length === 0) {
    bullets.push('- No metrics crossed the -10% decline threshold in this data.');
  }
  return bullets.join('\n');
}

function buildActions(datasets) {
  const bullets = [];
  datasets.forEach(d => {
    if (!d.analysis.comparison) return;
    const declines = d.analysis.comparison.filter(c => c.pctChange !== null && c.pctChange < -10);
    const gains = d.analysis.comparison.filter(c => c.pctChange !== null && c.pctChange > 20);
    declines.forEach(c => bullets.push(`- Investigate root cause of the decline in **${c.metric}** (${d.label}) before next reporting cycle.`));
    gains.forEach(c => bullets.push(`- Assess whether the gain in **${c.metric}** (${d.label}) is repeatable and worth doubling down on.`));
  });
  if (bullets.length === 0) {
    bullets.push('- Continue monitoring; no metric moved sharply enough to require immediate action this period.');
  }
  return bullets.slice(0, 4).join('\n');
}

function buildAppendix(datasets) {
  const sections = datasets.map(d => {
    const rows = Object.entries(d.analysis.overallTotals).map(([k, v]) => `| ${k} | ${fmtNum(v)} |`);
    const table = rows.length > 0 ? ['| Metric | Total |', '|---|---|', ...rows].join('\n') : '_No numeric columns detected._';
    return `### ${d.label}\n${d.analysis.rowCount} rows analyzed.\n\n${table}`;
  });
  return sections.join('\n\n');
}

function renderReport(datasets, title) {
  const date = new Date().toISOString().split('T')[0];
  return `# ${title || 'Executive Report'}
_Generated ${date}_

## Headline
${buildHeadline(datasets)}

## Key Metrics Snapshot
${buildMetricsTable(datasets)}

## What's Driving the Numbers
${buildDrivers(datasets)}

## Risks / Watch Items
${buildRisks(datasets)}

## Recommended Actions
${buildActions(datasets)}

## Appendix
${buildAppendix(datasets)}
`;
}

module.exports = { renderReport };
