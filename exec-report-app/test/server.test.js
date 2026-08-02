const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer } = require('../server');

test('serves the app shell and disables caching for browser assets', async () => {
  const server = await startServer(0);
  const port = server.address().port;

  try {
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(rootResponse.status, 200);
    assert.match(await rootResponse.text(), /Typecast/);
    assert.match(rootResponse.headers.get('cache-control') || '', /no-store/i);

    const cssResponse = await fetch(`http://127.0.0.1:${port}/styles.css`);
    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.headers.get('cache-control') || '', /no-store/i);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
