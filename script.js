/* Papercraft — SPA (Viewer, Merge, Organize, Scrub)
 * Strict CSP friendly: no inline styles/attrs.
 * Uses pinned CDN libs; all-client-side.
*/
(() => {
  // --- Vendor bindings -------------------------------------------------------
  const PDFL = window.PDFLib; // pdf-lib
  const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;

  if (!PDFL || !pdfjsLib) {
    const warn = document.createElement('div');
    warn.className = 'panel';
    warn.textContent = 'Libraries failed to load. Check network/CSP.';
    document.body.prepend(warn);
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';

  // --- Router ----------------------------------------------------------------
  const routes = {
    '/viewer': renderViewer,
    '/merge': renderMerge,
    '/organize': renderOrganize,
    '/scrub': renderScrub,
    '/about': renderAbout,
    '/': renderHome,
  };
  const appEl = document.getElementById('app');
  const navLinks = () => Array.from(document.querySelectorAll('[data-route]'));
  function navigate(hash) {
    const path = (hash || location.hash || '#/').slice(1) || '/';
    appEl.innerHTML = '';
    navLinks().forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${path}`));
    (routes[path] || renderHome)();
    appEl.focus();
  }
  window.addEventListener('hashchange', () => navigate());
  window.addEventListener('DOMContentLoaded', () => {
    if (!location.hash) location.hash = '#/viewer';
    navigate();
  });

  // --- Utils -----------------------------------------------------------------
  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children)) n.appendChild(c);
    return n;
  }
  async function fileToBytes(file) {
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }
  function downloadBytes(bytes, name = 'output.pdf', type = 'application/pdf') {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url });
    a.download = name.replace(/[/\\:?*"<>|]+/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Diagnostics ---------------------------------------------------------------
  function hex(n){ return n.toString(16).padStart(2,'0'); }
  function bytesPreview(bytes, n=64){
    const slice = bytes.slice(0, n);
    const hexs = Array.from(slice).map(b=>hex(b)).join(' ');
    let ascii = '';
    for (const b of slice) ascii += (b>=32 && b<=126) ? String.fromCharCode(b) : '.';
    return { hex: hexs, ascii, len: bytes.length };
  }

  // Robust PDF detection/normalization ---------------------------------------
  function findPdfHeaderOffset(bytes, maxScan = 65536) {
    const sig = [0x25, 0x50, 0x44, 0x46]; // %PDF
    const lim = Math.max(0, Math.min(bytes.length - 4, maxScan));
    for (let i = 0; i <= lim; i++) {
      if (
        bytes[i] === sig[0] &&
        bytes[i + 1] === sig[1] &&
        bytes[i + 2] === sig[2] &&
        bytes[i + 3] === sig[3]
      ) return i;
    }
    return -1;
  }
  function normalizePdfBytes(bytes) {
    if (!bytes || bytes.length < 5) throw new Error('Empty file (0 bytes).');
    // Skip UTF-8 BOM if present
    let off = 0;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) off = 3;
    if (bytes[off] === 0x25 && bytes[off + 1] === 0x50 && bytes[off + 2] === 0x44 && bytes[off + 3] === 0x46) {
      return off ? bytes.subarray(off) : bytes;
    }
    // Scan for header a bit deeper (handles junk prefixes)
    const pos = findPdfHeaderOffset(bytes);
    if (pos >= 0) return bytes.subarray(pos);
    const { hex: hx, ascii, len } = bytesPreview(bytes, 64);
    console.error('Not a PDF. First bytes:', { ascii, hex: hx, len });
    throw new Error('Not a PDF (no %PDF- header found in first 64 KB).');
  }

  // Common rendering helper
  async function renderPageToCanvas(pdfjsDoc, pageIndex, scale = 0.25) {
    const page = await pdfjsDoc.getPage(pageIndex + 1);
    const v = page.getViewport({ scale });
    const canvas = el('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(v.width * ratio);
    canvas.height = Math.floor(v.height * ratio);
    const transform = ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null;
    await page.render({ canvasContext: ctx, viewport: v, transform }).promise;
    return canvas;
  }
  function note(text) { return el('div', { class: 'note', text }); }

  // Sample PDF to isolate environment vs. file problems -----------------------
  async function makeSamplePdfBytes() {
    const doc = await PDFL.PDFDocument.create();
    doc.addPage([612, 792]); // US Letter
    doc.setTitle('Papercraft Sample');
    return await doc.save();
  }

  // --- HOME ------------------------------------------------------------------
  function renderHome() {
    appEl.append(
      el('section', { class: 'panel' }, [
        el('h2', { text: 'Welcome to Papercraft' }),
        el('p', { text: 'Free, private PDF tools. Everything runs in your browser. No uploads.' }),
        el('div', { class: 'grid cols-2' }, [
          el('div', { class: 'panel' }, [
            el('h3', { text: 'Start here' }),
            el('p', { text: 'Open and read PDFs quickly.' }),
            el('a', { class: 'link', href: '#/viewer', text: 'Open Viewer →' })
          ]),
          el('div', { class: 'panel' }, [
            el('h3', { text: 'Combine or reorganize' }),
            el('p', { text: 'Merge files, reorder pages, rotate, delete, and export.' }),
            el('a', { class: 'link', href: '#/merge', text: 'Merge PDFs →' }),
            el('br'),
            el('a', { class: 'link', href: '#/organize', text: 'Organize Pages →' }),
          ]),
        ]),
        el('div', { class: 'hr' }),
        note('Tip: If a URL returns a login/404 HTML page, it is not a PDF and will be rejected.')
      ])
    );
  }

  // --- VIEWER ----------------------------------------------------------------
  function renderViewer() {
    const file = el('input', { type: 'file', accept: 'application/pdf' });
    const urlBox = el('input', { type: 'url', placeholder: 'https://example.com/file.pdf' });
    const btnUrl = el('button', { class: 'primary', text: 'Open URL', onclick: () => openUrl(urlBox.value.trim()) });
    const btnSample = el('button', { text: 'Load Sample PDF', onclick: loadSample });

    const prev = el('button', { text: 'Prev', onclick: () => go(-1) });
    const next = el('button', { text: 'Next', onclick: () => go(1) });
    const zoomOut = el('button', { text: '−', onclick: () => { scale = Math.max(.2, scale / 1.2); render(); } });
    const zoomIn = el('button', { text: '+', onclick: () => { scale = Math.min(6, scale * 1.2); render(); } });
    const fit = el('button', { text: 'Fit', onclick: fitWidth });
    const pageInfo = el('span', { class: 'badge', text: '– / –' });

    const wrap = el('div', { id: 'viewerWrap', class: 'panel' });
    const canvas = el('canvas', { id: 'viewerCanvas' });
    wrap.append(canvas);

    const controls = el('div', { class: 'panel controls' }, [
      file, urlBox, btnUrl, btnSample,
      el('span', { class: 'hr', role: 'separator' }),
      prev, pageInfo, next, zoomOut, zoomIn, fit
    ]);

    appEl.append(el('section', { class: 'panel' }, [
      el('h2', { text: 'Viewer' }),
      controls,
      wrap
    ]));

    const ctx = canvas.getContext('2d', { alpha: false });
    let pdfDoc = null, pageNum = 1, scale = 1, renderTask = null;

    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const raw = await fileToBytes(f);
        console.log('[Viewer] File bytes:', bytesPreview(raw));
        const bytes = normalizePdfBytes(raw);
        await loadBytes(bytes);
      } catch (e) {
        console.error(e);
        alert(e.message);
      }
    });

    async function loadSample(){
      const bytes = await makeSamplePdfBytes();
      await loadBytes(bytes);
    }
    async function openUrl(u) {
      if (!u) return;
      try {
        const res = await fetch(u, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const raw = new Uint8Array(await res.arrayBuffer());
        console.log('[Viewer] URL bytes:', bytesPreview(raw));
        const bytes = normalizePdfBytes(raw);
        await loadBytes(bytes);
      } catch (e) {
        console.error(e);
        alert('Failed to load URL: ' + e.message);
      }
    }
    async function loadBytes(bytes) {
      cleanup();
      pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
      pageNum = 1; scale = 1; render();
    }
    function cleanup() {
      if (renderTask) { try { renderTask.cancel(); } catch {} renderTask = null; }
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if (pdfDoc) { try { pdfDoc.destroy(); } catch {} }
      pdfDoc = null; pageNum = 1; scale = 1; pageInfo.textContent = '– / –';
    }
    async function render() {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(pageNum);
      const v = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(v.width * ratio);
      canvas.height = Math.floor(v.height * ratio);
      const transform = ratio !== 1 ? [ratio,0,0,ratio,0,0] : null;
      if (renderTask) { try { renderTask.cancel(); } catch {} }
      renderTask = page.render({ canvasContext: ctx, viewport: v, transform });
      try { await renderTask.promise; } finally { renderTask = null; }
      pageInfo.textContent = `${pageNum} / ${pdfDoc.numPages}`;
    }
    function go(delta) { if (!pdfDoc) return; pageNum = Math.max(1, Math.min(pdfDoc.numPages, pageNum + delta)); render(); }
    async function fitWidth() {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(pageNum);
      const v = page.getViewport({ scale: 1 });
      const width = wrap.clientWidth - 24;
      scale = Math.max(.2, width / v.width);
      render();
    }
  }

  // --- MERGE -----------------------------------------------------------------
  function renderMerge() {
    const file = el('input', { type: 'file', accept: 'application/pdf', multiple: true });
    const list = el('div', { class: 'panel' });
    const outName = el('input', { type: 'text', value: 'merged.pdf' });
    const mergeBtn = el('button', { class: 'primary', text: 'Merge', onclick: merge });
    const clearBtn = el('button', { text: 'Clear', onclick: () => { items = []; renderList(); } });
    const status = el('span', { class: 'badge', text: '' });
    const sampleBtn = el('button', { text: 'Add Sample', onclick: addSample });

    appEl.append(
      el('section', { class: 'panel' }, [
        el('h2', { text: 'Merge PDFs' }),
        el('div', { class: 'controls' }, [
          file, sampleBtn, clearBtn, el('span', { class:'hr', role:'separator'}),
          el('span', { text:'Output:' }), outName, mergeBtn, status
        ]),
        list,
        note('Order matters. Reorder with the arrows. Everything stays vector.')
      ])
    );

    let items = []; // [{id, file}]
    let nextId = 1;

    file.addEventListener('change', () => {
      for (const f of file.files) items.push({ id: nextId++, file: f });
      renderList(); file.value = '';
    });

    async function addSample() {
      const bytes = await makeSamplePdfBytes();
      const f = new File([bytes], `sample-${nextId}.pdf`, { type: 'application/pdf' });
      items.push({ id: nextId++, file: f });
      renderList();
    }

    function renderList() {
      list.innerHTML = '';
      if (!items.length) { list.append(el('div', { class: 'note', text: 'No files selected yet.' })); return; }
      for (let i=0;i<items.length;i++) {
        const it = items[i];
        const row = el('div', { class: 'row' }, [
          el('div', { class:'badge', text: `${i+1}` }),
          el('div', { text: `${it.file.name} (${Math.round(it.file.size/1024)} KB)` }),
          el('span', { class:'row ml-auto' }, [
            el('button', { text:'↑', onclick: () => { if (i>0) { [items[i-1], items[i]] = [items[i], items[i-1]]; renderList(); }}}),
            el('button', { text:'↓', onclick: () => { if (i<items.length-1) { [items[i+1], items[i]] = [items[i], items[i+1]]; renderList(); }}}),
            el('button', { text:'✕', onclick: () => { items = items.filter(x => x.id !== it.id); renderList(); }})
          ])
        ]);
        list.append(row);
      }
    }

    async function merge() {
      if (!items.length) { status.textContent = 'Add files first.'; return; }
      status.textContent = 'Merging…';
      try {
        const out = await PDFL.PDFDocument.create();
        for (const it of items) {
          const raw = await fileToBytes(it.file);
          console.log('[Merge] File bytes:', it.file.name, bytesPreview(raw));
          const srcBytes = normalizePdfBytes(raw);
          const src = await PDFL.PDFDocument.load(srcBytes, { ignoreEncryption: true });
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach(p => out.addPage(p));
        }
        const bytes = await out.save({ updateFieldAppearances: false });
        downloadBytes(bytes, outName.value || 'merged.pdf');
        status.textContent = 'Done.';
      } catch (e) {
        console.error(e);
        status.textContent = 'Merge failed: ' + e.message;
      }
    }
  }

  // --- ORGANIZE (reorder/rotate/delete, export) ------------------------------
  function renderOrganize() {
    const file = el('input', { type:'file', accept:'application/pdf' });
    const grid = el('div', { class: 'thumbwall' });
    const expName = el('input', { type:'text', value:'organized.pdf' });
    const exportBtn = el('button', { class:'good', text:'Export', onclick: exportDoc });
    const status = el('span', { class:'badge', text:'' });
    const btnSample = el('button', { text:'Load Sample PDF', onclick: loadSample });

    appEl.append(
      el('section', { class:'panel' }, [
        el('h2', { text:'Organize Pages' }),
        el('div', { class:'controls' }, [
          file, btnSample, el('span', { class:'hr'}), el('span', { text:'Output:'}), expName, exportBtn, status
        ]),
        el('div', { class:'panel' }, [grid]),
        note('Use ↑/↓ to reorder. Rotate per-page. Delete pages you don’t want.')
      ])
    );

    let pdfjsDoc = null;
    let srcPdfLib = null;
    let pageModel = []; // [{index, rotate (0/90/180/270), keep}]

    async function loadSample(){
      try{
        const raw = await makeSamplePdfBytes();
        await loadAll(raw);
      } catch (e) {
        console.error(e); status.textContent = e.message;
      }
    }

    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const raw = await fileToBytes(f);
        console.log('[Organize] File bytes:', bytesPreview(raw));
        const bytes = normalizePdfBytes(raw);
        await loadAll(bytes);
      } catch (e) {
        console.error(e);
        status.textContent = e.message;
      }
    });

    async function loadAll(bytes){
      // IMPORTANT: clone for each library so the worker transfer doesn't detach the other
      const bytesForJs  = bytes.slice(0);   // clone for PDF.js
      const bytesForLib = bytes.slice(0);   // separate clone for pdf-lib

      // Load for thumbnails
      try {
        pdfjsDoc = await pdfjsLib.getDocument({ data: bytesForJs }).promise;
      } catch (e) {
        console.error(e); status.textContent = 'Viewer failed: ' + e.message; return;
      }
      // Load for export
      try {
        srcPdfLib = await PDFL.PDFDocument.load(bytesForLib, { ignoreEncryption: true });
      } catch (e) {
        console.error(e); status.textContent = 'Loader failed: ' + e.message; return;
      }
      const count = pdfjsDoc.numPages;
      pageModel = Array.from({ length: count }, (_, i) => ({ index:i, rotate:0, keep:true }));
      renderThumbs();
    }

    async function renderThumbs() {
      grid.innerHTML = '';
      if (!pdfjsDoc) { grid.append(note('Open a PDF above.')); return; }
      for (let i=0;i<pageModel.length;i++) {
        const pm = pageModel[i];
        const card = el('div', { class:'thumb', draggable:'true' });

        const canvas = await renderPageToCanvas(pdfjsDoc, pm.index, .25);
        // rotation & keep via classes (CSP-safe)
        canvas.classList.remove('rot-0','rot-90','rot-180','rot-270','dim');
        canvas.classList.add(`rot-${pm.rotate}`);
        if (!pm.keep) canvas.classList.add('dim');

        const label = el('div', { class:'row' }, [
          el('span', { class:'badge', text: `Page ${i+1}` }),
          el('span', { class:'row' }, [
            el('button', { title:'Up', text:'↑', onclick: () => move(i,-1) }),
            el('button', { title:'Down', text:'↓', onclick: () => move(i,1) }),
          ])
        ]);
        const ops = el('div', { class:'row' }, [
          el('button', { text:'⟲', title:'Rotate -90°', onclick: () => rotate(i, -90) }),
          el('button', { text:'⟳', title:'Rotate +90°', onclick: () => rotate(i, 90) }),
          el('button', { text: pm.keep ? 'Delete' : 'Restore', onclick: () => toggleKeep(i) }),
        ]);

        // Drag & drop reordering
        card.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', String(i)); card.classList.add('dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('dragover', ev => ev.preventDefault());
        card.addEventListener('drop', ev => {
          ev.preventDefault();
          const from = Number(ev.dataTransfer.getData('text/plain'));
          const to = i;
          if (!Number.isInteger(from) || from === to) return;
          const [m] = pageModel.splice(from,1);
          pageModel.splice(to,0,m);
          renderThumbs();
        });

        card.append(canvas, label, ops);
        grid.append(card);
      }
    }

    function move(i, delta) {
      const j = i + delta;
      if (j < 0 || j >= pageModel.length) return;
      [pageModel[i], pageModel[j]] = [pageModel[j], pageModel[i]];
      renderThumbs();
    }
    function rotate(i, d) {
      const pm = pageModel[i];
      pm.rotate = ((pm.rotate + d) % 360 + 360) % 360;
      renderThumbs();
    }
    function toggleKeep(i) {
      pageModel[i].keep = !pageModel[i].keep;
      renderThumbs();
    }

    async function exportDoc() {
      if (!srcPdfLib) { status.textContent = 'Open a PDF first.'; return; }
      status.textContent = 'Building…';
      try {
        const out = await PDFL.PDFDocument.create();
        const keepList = pageModel.filter(p => p.keep);
        if (!keepList.length) { status.textContent = 'Nothing to export.'; return; }
        const srcIdx = keepList.map(p => p.index);
        const copied = await out.copyPages(srcPdfLib, srcIdx);
        for (let i = 0; i < keepList.length; i++) {
          const pm = keepList[i];
          const page = copied[i];
          if (pm.rotate) page.setRotation(PDFL.degrees(pm.rotate));
          out.addPage(page);
        }
        const bytes = await out.save({ updateFieldAppearances:false });
        downloadBytes(bytes, expName.value || 'organized.pdf');
        status.textContent = 'Done.';
      } catch (e) {
        console.error(e);
        status.textContent = 'Failed: ' + e.message;
      }
    }
  }

  // --- SCRUB (rebuild & clear common metadata) -------------------------------
  function renderScrub() {
    const file = el('input', { type:'file', accept:'application/pdf' });
    const outName = el('input', { type:'text', value:'scrubbed.pdf' });
    const go = el('button', { class:'warn', text:'Scrub & Save', onclick: scrub });
    const status = el('span', { class:'badge', text:'' });

    appEl.append(
      el('section', { class:'panel' }, [
        el('h2', { text:'Scrub Metadata' }),
        el('div', { class:'controls' }, [file, el('span',{class:'hr'}), el('span',{text:'Output:'}), outName, go, status]),
        note('Rebuilds pages and clears common metadata fields.')
      ])
    );

    async function scrub() {
      const f = file.files?.[0];
      if (!f) { status.textContent = 'Choose a file.'; return; }
      status.textContent = 'Scrubbing…';
      try {
        const raw = await fileToBytes(f);
        console.log('[Scrub] File bytes:', bytesPreview(raw));
        const bytes = normalizePdfBytes(raw);
        const src = await PDFL.PDFDocument.load(bytes, { ignoreEncryption: true });
        const out = await PDFL.PDFDocument.create();
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach(p => out.addPage(p));

        out.setTitle(''); out.setAuthor(''); out.setSubject('');
        out.setKeywords([]); out.setCreator(''); out.setProducer('Papercraft');

        const res = await out.save({ updateFieldAppearances:false });
        downloadBytes(res, outName.value || 'scrubbed.pdf');
        status.textContent = 'Done.';
      } catch (e) {
        console.error(e);
        status.textContent = 'Failed: ' + e.message;
      }
    }
  }

  // --- ABOUT -----------------------------------------------------------------
  function renderAbout() {
    appEl.append(
      el('section', { class:'panel' }, [
        el('h2', { text:'About' }),
        el('p', { text:'Papercraft is a free, local-first toolbox for PDFs. Your files never leave your device.' }),
        el('div', { class:'kv' }, [
          el('div', { text:'Privacy' }), el('div', { text:'100% client-side. No tracking, no uploads.' }),
          el('div', { text:'Roadmap' }), el('div', { text:'OCR, safe redaction, compare, PDF/A export.' }),
          el('div', { text:'Keyboard' }), el('div', { text:'Use ↑/↓ to reorder; ⟲/⟳ to rotate.' }),
        ]),
      ])
    );
  }
})();
