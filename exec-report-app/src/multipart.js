/**
 * Minimal multipart/form-data parser — no external dependencies.
 * Parses a raw request body Buffer given the boundary from the Content-Type header.
 * Returns { fields: { name: value }, files: [ { fieldName, fileName, contentType, data: Buffer } ] }
 */
function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);

  while (start !== -1) {
    const nextStart = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (nextStart === -1) break;

    // Content between this boundary and the next (excluding the boundary markers themselves)
    let chunk = buffer.slice(start + boundaryBuf.length, nextStart);
    // Trim leading CRLF and trailing CRLF before next boundary
    if (chunk.slice(0, 2).toString() === '\r\n') chunk = chunk.slice(2);
    if (chunk.slice(-2).toString() === '\r\n') chunk = chunk.slice(0, -2);

    if (chunk.length > 0) parts.push(chunk);
    start = nextStart;
  }

  const fields = {};
  const files = [];

  parts.forEach(part => {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const headerText = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);

    const dispositionMatch = headerText.match(/Content-Disposition:\s*form-data;\s*(.*)/i);
    if (!dispositionMatch) return;

    const nameMatch = dispositionMatch[1].match(/name="([^"]*)"/);
    const fileNameMatch = dispositionMatch[1].match(/filename="([^"]*)"/);
    const contentTypeMatch = headerText.match(/Content-Type:\s*(.+)/i);

    const fieldName = nameMatch ? nameMatch[1] : null;
    if (!fieldName) return;

    if (fileNameMatch) {
      if (fileNameMatch[1] === '') return; // empty file input, skip
      files.push({
        fieldName,
        fileName: fileNameMatch[1],
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
        data: body,
      });
    } else {
      fields[fieldName] = body.toString('utf8');
    }
  });

  return { fields, files };
}

function extractBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) return null;
  return (match[1] || match[2] || '').trim();
}

module.exports = { parseMultipart, extractBoundary };
