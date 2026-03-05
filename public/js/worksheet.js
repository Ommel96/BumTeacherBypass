/**
 * Worksheet utilities -- auto-save & restore, hints, reset
 * Dual persistence: localStorage (instant) + SQLite via API (durable).
 *
 * Usage: give every input/textarea a unique `id`.
 * Call `Worksheet.init('module-topic-worksheet')` with a unique key.
 */

const Worksheet = (() => {
  let _worksheetKey = '';
  let _localKey = '';
  let _saveTimeout = null;

  function init(worksheetKey) {
    _worksheetKey = worksheetKey;
    _localKey = 'btb_' + worksheetKey;
    restoreAll();
    bindAutoSave();
    createSaveIndicator();
    createExportButton();
  }

  // ── Data gathering ──

  function gatherData() {
    const data = {};
    document.querySelectorAll(
      'input[type="text"], input[type="number"], textarea, select'
    ).forEach(el => {
      if (el.id && !el.id.startsWith('btb-')) {
        data[el.id] = el.value;
      }
    });
    return data;
  }

  function applyData(data) {
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
  }

  // ── Save ──

  function saveAll() {
    const fields = gatherData();

    // 1. localStorage (instant, offline-safe)
    try {
      localStorage.setItem(_localKey, JSON.stringify(fields));
    } catch (e) { /* ignore */ }

    // 2. API (durable, SQLite)
    fetch('/api/worksheet/' + encodeURIComponent(_worksheetKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    })
    .then(r => { if (r.ok) flashSave('synced'); else flashSave('local'); })
    .catch(() => flashSave('local'));
  }

  // ── Restore ──

  function restoreAll() {
    // 1. Try API first
    fetch('/api/worksheet/' + encodeURIComponent(_worksheetKey))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.fields && Object.keys(data.fields).length > 0) {
          applyData(data.fields);
          try { localStorage.setItem(_localKey, JSON.stringify(data.fields)); } catch(e) {}
        } else {
          restoreFromLocal();
        }
      })
      .catch(() => restoreFromLocal());
  }

  function restoreFromLocal() {
    try {
      const raw = localStorage.getItem(_localKey);
      if (!raw) return;
      applyData(JSON.parse(raw));
    } catch (e) {
      console.warn('LocalStorage restore failed', e);
    }
  }

  // ── Clear ──

  function clearAll() {
    try { localStorage.removeItem(_localKey); } catch (e) { /* ignore */ }
    fetch('/api/worksheet/' + encodeURIComponent(_worksheetKey), {
      method: 'DELETE'
    }).catch(() => {});
  }

  // ── Auto-save binding ──

  function bindAutoSave() {
    document.addEventListener('input', () => {
      clearTimeout(_saveTimeout);
      _saveTimeout = setTimeout(saveAll, 800);
    });
  }

  // ── Save indicator ──

  function createSaveIndicator() {
    const el = document.createElement('div');
    el.className = 'save-status';
    el.id = 'save-status';

    const dot = document.createElement('span');
    dot.className = 'save-dot';
    el.appendChild(dot);

    const text = document.createElement('span');
    text.className = 'save-text';
    text.textContent = ' Gespeichert';
    el.appendChild(text);

    document.body.appendChild(el);
  }

  function flashSave(mode) {
    const el = document.getElementById('save-status');
    if (!el) return;
    const dot = el.querySelector('.save-dot');
    const text = el.querySelector('.save-text');
    if (mode === 'synced') {
      if (dot) dot.className = 'save-dot dot-synced';
      if (text) text.textContent = ' Gespeichert';
    } else {
      if (dot) dot.className = 'save-dot dot-local';
      if (text) text.textContent = ' Lokal gespeichert';
    }
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  // ── Export ──

  function createExportButton() {
    const bar = document.createElement('div');
    bar.className = 'export-bar';
    bar.id = 'export-bar';

    const btn = document.createElement('button');
    btn.className = 'btn btn-export';
    btn.title = 'Als PDF herunterladen';
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> PDF Export';
    btn.addEventListener('click', exportPDF);
    bar.appendChild(btn);

    document.body.appendChild(bar);
  }

  function exportPDF() {
    // Temporarily convert inputs/textareas to visible text for print
    const fields = [];
    document.querySelectorAll('input[type="text"], input[type="number"], textarea').forEach(el => {
      const span = document.createElement('span');
      span.className = 'print-value';
      span.textContent = el.value || '\u2014';
      el.parentNode.insertBefore(span, el.nextSibling);
      fields.push({ input: el, span });
    });

    document.body.classList.add('printing');

    fields.forEach(({ input, span }) => {
      input.style.display = 'none';
      span.style.display = 'inline';
    });

    window.print();

    document.body.classList.remove('printing');
    fields.forEach(({ input, span }) => {
      input.style.display = '';
      span.remove();
    });
  }

  // ── Solution checking ──

  /**
   * Check a single field against an expected answer.
   * @param {string} fieldId - The input/textarea id
   * @param {string} expected - The correct answer
   * @param {string} feedbackId - The id of the feedback div
   * @param {string} hint - Hint to show if wrong
   * @param {object} opts - Options: { normalize: true, contains: false }
   */
  function checkField(fieldId, expected, feedbackId, hint, opts = {}) {
    const el = document.getElementById(fieldId);
    const fb = document.getElementById(feedbackId);
    if (!el || !fb) return;

    const normalize = opts.normalize !== false;
    const contains = opts.contains === true;

    let val = el.value;
    let exp = expected;

    if (normalize) {
      val = val.trim().toLowerCase().replace(/\s+/g, ' ');
      exp = exp.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    if (!val) {
      showFeedback(fb, 'error', 'Bitte zuerst ausfüllen.');
      return false;
    }

    const correct = contains ? val.includes(exp) : val === exp;

    if (correct) {
      showFeedback(fb, 'success', 'Korrekt!');
      el.classList.remove('field-error');
      el.classList.add('field-success');
      return true;
    } else {
      showFeedback(fb, 'error', 'Nicht ganz. ' + (hint || 'Versuche es nochmal.'));
      el.classList.remove('field-success');
      el.classList.add('field-error');
      return false;
    }
  }

  /**
   * Check multiple fields at once.
   * @param {Array} checks - Array of { fieldId, expected, hint?, opts? }
   * @param {string} feedbackId - The id of the shared feedback div
   */
  function checkFields(checks, feedbackId) {
    const fb = document.getElementById(feedbackId);
    if (!fb) return;

    let allCorrect = true;
    let firstHint = '';

    for (const c of checks) {
      const el = document.getElementById(c.fieldId);
      if (!el) continue;

      const normalize = !c.opts || c.opts.normalize !== false;
      let val = el.value;
      let exp = c.expected;

      if (normalize) {
        val = val.trim().toLowerCase().replace(/\s+/g, ' ');
        exp = exp.trim().toLowerCase().replace(/\s+/g, ' ');
      }

      if (!val) {
        el.classList.remove('field-success', 'field-error');
        allCorrect = false;
        if (!firstHint) firstHint = 'Fülle alle Felder aus.';
        continue;
      }

      const correct = c.opts && c.opts.contains ? val.includes(exp) : val === exp;

      if (correct) {
        el.classList.remove('field-error');
        el.classList.add('field-success');
      } else {
        el.classList.remove('field-success');
        el.classList.add('field-error');
        allCorrect = false;
        if (!firstHint && c.hint) firstHint = c.hint;
      }
    }

    if (allCorrect) {
      showFeedback(fb, 'success', 'Alles korrekt!');
    } else {
      showFeedback(fb, 'error', 'Noch nicht ganz richtig. ' + (firstHint || 'Prüfe die markierten Felder.'));
    }
  }

  function showFeedback(el, type, msg) {
    el.className = 'feedback show ' + type;
    el.textContent = msg;
  }

  // ── Hints ──

  function toggleHint(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show');
  }

  // ── Reset ──

  function resetFields(ids) {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        el.classList.remove('field-success', 'field-error');
      }
    });
    document.querySelectorAll('.feedback.show').forEach(fb => {
      fb.className = 'feedback';
      fb.textContent = '';
    });
    saveAll();
  }

  return { init, toggleHint, resetFields, clearAll, saveAll, exportPDF, checkField, checkFields };
})();
