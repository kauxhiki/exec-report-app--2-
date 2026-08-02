# Executive Report Generator

A standalone Node.js CLI that turns raw spreadsheet/CSV data into a written executive summary — headline takeaway, key metrics, drivers, risks, and recommended actions — following a consistent structure every time.

## Browser UI (Typecast)

Prefer a visual interface over the CLI? Run the built-in local web app instead — no extra dependencies required, it uses only Node's core modules:

```bash
node server.js
```

Then open **http://localhost:4700** in your browser. Drag in one or more CSV/Excel files, set a title, toggle SQL generation on/off, and click **Generate**. You'll get:
- The full executive summary, previewed inline and downloadable as `report.md`
- A visual schema (column name → inferred MySQL type)
- Download buttons for `<table>_create.sql` and `<table>_insert.sql` per file

Everything runs and stays on your machine — files are processed in memory and never written to disk by the server, and nothing is sent anywhere over the network.

To use a different port: `PORT=5000 node server.js`.

## Setup

1. Open this folder in VS Code.
2. Open a terminal in VS Code (`` Ctrl+` `` / `` Cmd+` ``).
3. Install dependencies (only needed once, and only required if you plan to use `.xlsx`/`.xls` files — CSV works with zero dependencies):
   ```bash
   npm install
   ```

## Usage

```bash
node index.js <file1> [file2 ...] [options]
```

**Options:**
- `--out <path>` — output markdown file (default: `exec-report.md`)
- `--title <text>` — report title (default: `Executive Report`)
- `--help` — show usage

**Examples:**
```bash
node index.js sales.csv
node index.js sales.csv marketing.xlsx --out reports/q3.md --title "Q3 Business Review"
```

The report is written to a `.md` file you can open directly in VS Code (it renders nicely with the built-in Markdown preview: `Ctrl+Shift+V` / `Cmd+Shift+V`), paste into email/Slack, or convert to Word/PDF separately.

## How it works

- **Column detection**: automatically identifies date/period columns, numeric metric columns, and categorical breakdown columns (e.g., region, product, team) — no configuration needed, works with whatever columns your file has.
- **Period comparison**: if a date/period column is found, it groups rows by month and compares the two most recent periods for every numeric metric (% change, trend direction).
- **Drivers**: if a categorical column exists (e.g., "Region"), it surfaces the top contributors to the metric that moved the most.
- **Risks**: flags any metric that declined more than 10% period-over-period.
- **Actions**: auto-generates next-step suggestions for metrics that declined sharply (>10%) or grew sharply (>20%).

This is rule-based analysis (no external AI calls) — fast, free, runs fully offline. It's tuned for clarity over sophistication; treat the "drivers"/"actions" sections as a starting point for your own judgment, not a final verdict.

## Sample data

Try it immediately with the included sample:
```bash
node index.js sample-data/sales.csv --title "Sample Sales Review"
cat exec-report.md
```

## Convert to MySQL

Add `--sql` to also generate MySQL files for every input file/sheet — a `CREATE TABLE` statement and batched `INSERT` statements, as separate `.sql` files:

```bash
node index.js sales.csv --sql
node index.js sales.csv marketing.xlsx --sql --sql-out-dir sql --sql-batch-size 1000
```

This writes, per dataset, into the output directory (default `sql/`):
- `<table>_create.sql` — `CREATE TABLE IF NOT EXISTS` with inferred column types
- `<table>_insert.sql` — `INSERT INTO ... VALUES (...), (...), ...` in batches (default 500 rows/statement)

**Type inference:** each column is scanned and classified as `INT`/`BIGINT`, `DECIMAL(18,4)`, `DATE`/`DATETIME`, or `VARCHAR(n)`/`TEXT`, based on the actual values. Column and table names are sanitized into valid, lowercase, backtick-quoted SQL identifiers (spaces and symbols become underscores). String values are properly escaped (quotes, backslashes); empty cells become `NULL`.

Run the generated files against your database with the MySQL CLI:
```bash
mysql -u youruser -p yourdatabase < sql/sales_create.sql
mysql -u youruser -p yourdatabase < sql/sales_insert.sql
```

**Options:**
- `--sql` — enable SQL generation
- `--sql-out-dir <path>` — output directory (default: `sql`)
- `--sql-batch-size <n>` — rows per INSERT statement (default: 500)

## Multiple files / sheets

Pass as many files as you like — each `.xlsx` sheet is analyzed separately and included as its own section in the report:
```bash
node index.js sales.csv finance.xlsx marketing.xlsx --out full-review.md
```

## Limitations / notes

- Best with data that has one row per record and a date-like column (e.g., "Date", "Month", "Period") for trend comparisons. Without one, you'll still get totals, just no period-over-period change.
- Numbers with `$`, `,`, or `%` are handled automatically (stripped before parsing).
- If you want a smarter, AI-written narrative instead of the rule-based one, run the data through Claude directly (upload the CSV/xlsx to a chat and ask for the exec summary) — this CLI is for fast, offline, repeatable runs.
