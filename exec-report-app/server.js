#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadBuffer } = require('./src/parse');
const { runPipeline } = require('./src/pipeline');
const { parseMultipart, extractBoundary } = require('./src/multipart');

const DEFAULT_PORT = 4700;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25MB upload cap

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendFile(res, filePath, cacheControl) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl,
    });
    res.end(data);
  });
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, urlPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Cache-Control': 'no-store' });
    return res.end('Forbidden');
  }

  const cacheControl = urlPath === '/index.html' || urlPath === '/' ? 'no-store' : 'no-store';
  sendFile(res, filePath, cacheControl);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Upload too large (25MB limit).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleGenerate(req, res) {
  try {
    const contentType = req.headers['content-type'] || '';
    const boundary = extractBoundary(contentType);
    if (!boundary) throw new Error('Expected multipart/form-data upload.');

    const body = await collectBody(req);
    const { fields, files } = parseMultipart(body, boundary);

    if (files.length === 0) throw new Error('No files were uploaded.');

    const loadedSheets = [];
    files.forEach(f => {
      const ext = path.extname(f.fileName).toLowerCase();
      loadedSheets.push(...loadBuffer(f.data, ext, f.fileName));
    });

    const title = fields.title && fields.title.trim() ? fields.title.trim() : 'Executive Report';
    const wantSql = fields.sql === 'true';
    const batchSize = parseInt(fields.batchSize, 10) || 500;

    const result = runPipeline(loadedSheets, { title, sql: wantSql, sqlBatchSize: batchSize });

    const responsePayload = {
      ok: true,
      reportMarkdown: result.reportMarkdown,
      datasets: result.datasets.map(d => ({
        label: d.label,
        rowCount: d.analysis.rowCount,
        columns: d.analysis.columns,
      })),
      sqlFiles: result.sqlFiles.map(f => ({
        tableName: f.tableName,
        label: f.label,
        createSql: f.createSql,
        insertSql: f.insertSql,
        schema: f.schema.map(c => ({ column: c.originalName, sqlColumn: c.sqlName, type: c.type })),
      })),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responsePayload));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/generate') {
      return handleGenerate(req, res);
    }
    if (req.method === 'GET') {
      return serveStatic(req, res);
    }
    res.writeHead(405, { 'Cache-Control': 'no-store' });
    res.end('Method not allowed');
  });
}

function startServer(port = process.env.PORT || DEFAULT_PORT) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      console.log(`\n  Typecast is running → http://localhost:${server.address().port}\n`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createServer, startServer };
