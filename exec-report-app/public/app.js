(() => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const generateBtn = document.getElementById('generateBtn');
  const generateLabel = document.getElementById('generateLabel');
  const errorMsg = document.getElementById('errorMsg');
  const sqlToggle = document.getElementById('sqlToggle');
  const batchField = document.getElementById('batchField');
  const titleInput = document.getElementById('titleInput');
  const batchInput = document.getElementById('batchInput');

  const results = document.getElementById('results');
  const headlineText = document.getElementById('headlineText');
  const reportPreview = document.getElementById('reportPreview');
  const schemaContainer = document.getElementById('schemaContainer');
  const downloadReportBtn = document.getElementById('downloadReportBtn');

  let selectedFiles = [];
  let lastReportMarkdown = '';

  function renderFileList() {
    fileList.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const li = document.createElement('li');
      const sizeKb = (file.size / 1024).toFixed(1);
      li.innerHTML = `<span>${escapeHtml(file.name)} · ${sizeKb} KB</span><span class="file-remove" data-idx="${idx}">remove</span>`;
      fileList.appendChild(li);
    });
    fileList.querySelectorAll('.file-remove').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        selectedFiles.splice(idx, 1);
        renderFileList();
      });
    });
  }

  function addFiles(fileArr) {
    const existingKeys = new Set(selectedFiles.map(f => `${f.name}:${f.size}`));
    fileArr.forEach(f => {
      const key = `${f.name}:${f.size}`;
      if (!existingKeys.has(key)) {
        selectedFiles.push(f);
        existingKeys.add(key);
      }
    });
    renderFileList();
  }

  fileInput.addEventListener('change', e => {
    addFiles(Array.from(e.target.files));
    fileInput.value = '';
  });

  ['dragover', 'dragenter'].forEach(evt =>
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach(evt =>
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  });

  sqlToggle.addEventListener('change', () => {
    batchField.style.display = sqlToggle.checked ? 'block' : 'none';
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function extractHeadline(markdown) {
    const match = markdown.match(/## Headline\s*\n([\s\S]*?)(?=\n## |\n?$)/);
    if (!match) return '';
    return match[1].trim();
  }

  function badgeClassForType(type) {
    if (/DATE|DATETIME/.test(type)) return 'badge-date';
    if (/INT/.test(type)) return 'badge-int';
    if (/DECIMAL/.test(type)) return 'badge-decimal';
    return 'badge-string';
  }

  function renderSchema(sqlFiles) {
    schemaContainer.innerHTML = '';
    if (!sqlFiles || sqlFiles.length === 0) {
      schemaContainer.innerHTML = '<p style="color:var(--ink-faint); font-size:13px;">SQL generation was not enabled for this run.</p>';
      return;
    }
    sqlFiles.forEach(f => {
      const title = document.createElement('div');
      title.className = 'schema-group-title';
      title.textContent = `\`${f.tableName}\` — from ${f.label}`;
      schemaContainer.appendChild(title);

      const table = document.createElement('table');
      table.className = 'schema-table';
      const rows = f.schema
        .map(
          c => `<tr><td>${escapeHtml(c.column)}</td><td><span class="badge ${badgeClassForType(c.type)}">${c.type}</span></td></tr>`
        )
        .join('');
      table.innerHTML = `<thead><tr><th>Column</th><th>Type</th></tr></thead><tbody>${rows}</tbody>`;
      schemaContainer.appendChild(table);

      const downloadRow = document.createElement('div');
      downloadRow.className = 'download-row';

      const createBtn = document.createElement('button');
      createBtn.className = 'btn btn-ghost';
      createBtn.textContent = `${f.tableName}_create.sql`;
      createBtn.addEventListener('click', () => downloadText(`${f.tableName}_create.sql`, f.createSql));

      const insertBtn = document.createElement('button');
      insertBtn.className = 'btn btn-ghost';
      insertBtn.textContent = `${f.tableName}_insert.sql`;
      insertBtn.addEventListener('click', () => downloadText(`${f.tableName}_insert.sql`, f.insertSql));

      downloadRow.appendChild(createBtn);
      downloadRow.appendChild(insertBtn);
      schemaContainer.appendChild(downloadRow);
    });
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  downloadReportBtn.addEventListener('click', () => downloadText('report.md', lastReportMarkdown));

  function setLoading(loading) {
    generateBtn.disabled = loading;
    generateLabel.textContent = loading ? 'Generating…' : 'Generate';
  }

  generateBtn.addEventListener('click', async () => {
    errorMsg.hidden = true;

    if (selectedFiles.length === 0) {
      errorMsg.textContent = 'Add at least one .csv or .xlsx file first.';
      errorMsg.hidden = false;
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('files', f, f.name));
    formData.append('title', titleInput.value || 'Executive Report');
    formData.append('sql', sqlToggle.checked ? 'true' : 'false');
    formData.append('batchSize', batchInput.value || '500');

    setLoading(true);
    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }

      lastReportMarkdown = data.reportMarkdown;
      headlineText.innerHTML = escapeHtml(extractHeadline(data.reportMarkdown)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      reportPreview.textContent = data.reportMarkdown;
      renderSchema(data.sqlFiles);

      results.hidden = false;
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.hidden = false;
    } finally {
      setLoading(false);
    }
  });
})();
