/* Общие функции интерфейса для обеих страниц: КП (хранится в браузере), карта освещённости, расчёт помещения. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rub = v => v ? Math.round(v).toLocaleString('ru-RU') + ' ₽' : '—';
  const n1 = v => (Math.round(v * 10) / 10).toLocaleString('ru-RU');

  /* ---------- Сохранение файлов: внутри Claude — через окно подтверждения, иначе обычная загрузка ---------- */
  let DL;
  const dlReady = (async () => { try { if (window.claude && window.claude.use) DL = await window.claude.use('downloads'); } catch (e) { DL = null; } return DL; })();
  /** true — файл обработан Claude (сохранён или посетитель отказался); false — сохранять обычным способом. */
  async function saveFile(filename, blob) {
    if (!(window.claude && window.claude.use)) return false;
    const d = await dlReady; if (!d) return false;
    try { await d.save({ filename, data: blob }); } catch (e) { if (e && e.code !== 'declined') console.warn('save', e); }
    return true;
  }

  /* ---------- КП: общее для обеих страниц хранилище ---------- */
  const KEY = 'maytoni_kp_v1';
  const subs = [];
  function kpLoad() { try { return JSON.parse(localStorage.getItem(KEY)) || { title: 'КП', rows: [] }; } catch (e) { return { title: 'КП', rows: [] }; } }
  let KP = kpLoad();
  function kpSave() { try { localStorage.setItem(KEY, JSON.stringify(KP)); } catch (e) { } subs.forEach(f => f(KP)); }
  const kp = {
    get: () => KP,
    set(rows, title) { KP = { title: title || KP.title || 'КП', rows: rows.map(r => ({ room: r.room || '', a: String(r.a || r.article || '').trim(), qty: +r.qty || 1 })) }; kpSave(); },
    add(rows) { for (const r of rows) { const a = String(r.a || r.article || '').trim(); const ex = KP.rows.find(x => x.a === a && x.room === (r.room || '')); if (ex) ex.qty += +r.qty || 1; else KP.rows.push({ room: r.room || '', a, qty: +r.qty || 1 }); } kpSave(); },
    update(i, patch) { Object.assign(KP.rows[i], patch); kpSave(); },
    remove(i) { KP.rows.splice(i, 1); kpSave(); },
    clear() { KP = { title: 'КП', rows: [] }; kpSave(); },
    on(f) { subs.push(f); },
    priced: () => MT.priceKP(KP.rows),
    async exportXlsx(name) {
      const wb = MT.kpToXlsx(XLSX, KP.rows, KP.title), fn = (name || KP.title || 'КП').replace(/[\\/:*?"<>|]/g, '_') + '.xlsx';
      if (await saveFile(fn, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]))) return;
      XLSX.writeFile(wb, fn);
    },
  };
  window.addEventListener('storage', e => { if (e.key === KEY) { KP = kpLoad(); subs.forEach(f => f(KP)); } });

  /** Таблица КП с редактированием. */
  function renderKP(el, opts = {}) {
    const draw = () => {
      const { lines, total, missing } = kp.priced();
      if (!lines.length) { el.innerHTML = '<p class="mute">КП пока пустое. Добавляйте позиции из каталога, расчёта или попросите ассистента.</p>'; return; }
      let room = null, h = '<div class="scroll"><table class="t"><tr><th>Помещение</th><th>Артикул</th><th>Наименование</th><th class="num">Кол-во</th><th class="num">РРЦ</th><th class="num">Сумма</th><th></th></tr>';
      lines.forEach((l, i) => {
        h += `<tr><td>${opts.compact ? esc(l.room) : `<input data-i="${i}" data-f="room" value="${esc(l.room)}">`}</td>
          <td>${esc(l.a)}${l.st ? ` <span class="pill ${l.st === 'Новинка' ? 'new' : ''}">${esc(l.st)}</span>` : ''}</td>
          <td>${esc(l.n)}</td>
          <td class="num">${opts.compact ? l.qty : `<input type="number" min="0" style="width:64px" data-i="${i}" data-f="qty" value="${l.qty}">`}</td>
          <td class="num">${rub(l.p)}</td><td class="num">${rub(l.sum)}</td>
          <td><button class="b ghost sm" data-del="${i}" title="Удалить">✕</button></td></tr>`;
      });
      h += `<tr><td colspan="5"><b>Итого</b> · ${lines.length} поз.</td><td class="num"><b>${rub(total)}</b></td><td></td></tr></table></div>`;
      if (missing.length) h += `<p class="mute">Нет цены в прайсе 2026: ${esc(missing.join(', '))}</p>`;
      el.innerHTML = h;
      el.querySelectorAll('input[data-i]').forEach(inp => inp.onchange = () => kp.update(+inp.dataset.i, { [inp.dataset.f]: inp.dataset.f === 'qty' ? +inp.value : inp.value }));
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => kp.remove(+b.dataset.del));
    };
    kp.on(draw); draw();
  }

  /* ---------- Расчёт помещения (для страницы инструментов и для агента) ---------- */
  /** p: {room, L, W, H, E?, Ke?, rp?, rc?, rr?, fixture?, mount?, cap?, existing?, source?, lm?, ang?, lor?, ldt?, minShare?} */
  function roomCalc(p) {
    const nr = MT.normFor(p.room || '');
    const R = { L: Math.max(+p.L, +p.W), W: Math.min(+p.L, +p.W), H: +p.H || 2.7, E: +p.E || nr.E, Ke: +p.Ke || 0.8, rp: p.rp ?? 0.7, rc: p.rc ?? 0.5, rr: p.rr ?? 0.2 };
    if (!(R.L > 0 && R.W > 0)) throw new Error('Нужны длина и ширина помещения');
    const fx = p.fixture ? MT.get(p.fixture) : null;
    const prof = fx ? MT.fixtureProfile(fx) : { mount: p.mount || 'deep', cap: (p.cap || 'GU10').toUpperCase(), p: 0 };
    if (p.mount) prof.mount = p.mount; if (p.cap) prof.cap = p.cap.toUpperCase();
    // КСС производителя: из загруженного файла или из библиотеки по артикулу
    let phot = p.ldt ? Object.assign({ origin: 'загруженный файл' }, p.ldt) : null;
    if (!phot && fx && MT.photometryFor(fx.a)) phot = Object.assign({ origin: 'библиотека КСС' }, MT.photometryFor(fx.a));
    const integrated = fx && !MT.features(fx).cap && !p.source && !p.lm;   // светильник со встроенным LED: поток — из файла или каталога
    if (phot && !integrated) { prof.curve = phot.curve; prof.lor = phot.LOR; }
    let res;
    const src = p.source ? MT.get(p.source) : null;
    if (integrated && (phot || fx.lm)) {
      const F = phot && phot.flux ? phot.flux : fx.lm, curve = phot ? phot.curve : MT.beamCurve(fx.ang || 60);
      const e = MT.estimate(curve, R, F), n = +p.existing || Math.max(e.N, p.minN || 0);
      res = { src: { a: 'встроенный LED', lm: Math.round(F), ang: phot ? phot.beam : (fx.ang || 60) }, beam: phot ? phot.beam : (fx.ang || 60), lor: 1, F, Nreq: e.N, n, E: e.En(n), curve, options: null };
    } else if (src || p.lm) {                                   // источник задан — считаем как есть
      const lm = +p.lm || src.lm, ang = +p.ang || src?.ang || (prof.cap === 'GX53' ? 120 : 38);
      const usePh = phot && ang <= 45;   // кривая из файла снята с лампой 38–40°
      const beam = usePh ? phot.beam : MT.beamFor(prof.mount, ang), lor = +p.lor || (usePh ? phot.LOR : 0) || MT.lorFor(prof.mount, ang);
      const curve = usePh ? phot.curve : MT.beamCurve(beam), F = lm * lor;
      const e = MT.estimate(curve, R, F); const n = +p.existing || e.N;
      res = { src: { a: src?.a || 'вручную', lm, ang, n: src?.n, p: src?.p }, beam, lor, F, Nreq: e.N, n, E: e.En(n), curve, options: null };
    } else {
      res = MT.pickSource(prof, R, { existing: +p.existing || 0, minShare: p.minShare ?? 0.7, dimmable: p.dimmable });
      if (!res) throw new Error('Для цоколя ' + prof.cap + ' нет списка источников — укажите поток и угол вручную');
    }
    const g = MT.pointGrid(R, res.n, res.curve, res.F);
    // карта показывает распределение по точечному расчёту, уровень приводим к оценке по коэффициенту использования
    const k = res.E / g.avg; g.grid = g.grid.map(v => v * k); g.avg *= k; g.min *= k; g.max *= k;
    const ok = res.E >= R.E * 0.98;
    return { R, norm: nr, fixture: fx ? { a: fx.a, n: fx.n, p: fx.p } : null, profile: { mount: prof.mount, cap: prof.cap }, pick: res, grid: g, ok,
      summary: {
        room: p.room || '', area: +(R.L * R.W).toFixed(2), target: R.E, fixture: fx?.a || null, source: res.src.a, source_name: res.src.n || null,
        source_flux: res.src.lm, source_angle: res.src.ang, fixture_efficiency: res.lor, required_count: res.Nreq, count: res.n, existing: +p.existing || null,
        E_avg_estimate: Math.round(res.E), E_point_avg: Math.round(g.avg), E_min: Math.round(g.min), U0: +g.U0.toFixed(2), meets_norm: ok,
        photometry: phot ? `${phot.origin}: ${phot.name || fx?.a || ''}`.trim() : 'типовая КСС (по углу)',
        options: res.options ? res.options.map(o => ({ source: o.src.a, flux: o.src.lm, angle: o.src.ang, required: o.Nreq, count: o.n, E: Math.round(o.E), price_source: o.src.p || null })) : undefined,
      } };
  }

  /** Карта освещённости в фиктивных цветах. */
  function drawMap(canvas, calc, title) {
    const g = calc.grid, R = calc.R, target = R.E;
    const pad = 34, Wpx = 640, scale = (Wpx - 2 * pad) / g.W, Hpx = Math.round(g.L * scale + 2 * pad + 26);
    canvas.width = Wpx; canvas.height = Hpx;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, Wpx, Hpx);
    const vmax = Math.max(target * 1.5, g.max);
    const cw = g.W / g.nx * scale, ch = g.L / g.ny * scale;
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const [r, gg, b] = MT.falseColor(g.grid[j * g.nx + i] / vmax); c.fillStyle = `rgb(${r},${gg},${b})`;
      c.fillRect(pad + i * cw, pad + j * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
    }
    c.strokeStyle = '#222'; c.lineWidth = 2; c.strokeRect(pad, pad, g.W * scale, g.L * scale);
    for (const [x, y] of g.pts) { c.beginPath(); c.arc(pad + x * scale, pad + y * scale, 5, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke(); }
    c.fillStyle = '#111'; c.font = '600 13px system-ui'; c.fillText(title || calc.summary.room || 'Помещение', pad, 20);
    c.font = '12px system-ui'; c.fillStyle = '#555';
    c.fillText(`${n1(g.W)} м`, pad + g.W * scale / 2 - 14, pad + g.L * scale + 16);
    c.save(); c.translate(pad - 10, pad + g.L * scale / 2 + 14); c.rotate(-Math.PI / 2); c.fillText(`${n1(g.L)} м`, 0, 0); c.restore();
    c.fillStyle = '#111'; c.font = '12px system-ui';
    c.fillText(`Eср ≈ ${Math.round(g.avg)} лк · Emin ${Math.round(g.min)} · U0 ${g.U0.toFixed(2)} · норма ${target} лк · шкала 0…${Math.round(vmax)} лк`, pad, Hpx - 8);
  }

  /** Сводка расчёта (HTML). */
  function calcHTML(calc) {
    const s = calc.summary;
    let h = `<div class="kpi">
      <div><span class="mute">Норма</span><b>${s.target} лк</b></div>
      <div><span class="mute">Получится (оценка)</span><b>${s.E_avg_estimate} лк</b></div>
      <div><span class="mute">Количество</span><b>${s.count} шт</b></div>
      <div><span class="mute">Нужно по расчёту</span><b>${s.required_count} шт</b></div>
      <div><span class="mute">Итог</span><b>${s.meets_norm ? '<span class="pill ok">норма выполнена</span>' : '<span class="pill bad">ниже нормы</span>'}</b></div></div>
      <p class="mute">Источник: ${esc(s.source)} ${s.source_name ? '· ' + esc(s.source_name) : ''} · ${s.source_flux} лм, ${s.source_angle}° · КПД светильника ${s.fixture_efficiency}<br>Кривая силы света: ${/библиотека|файл/.test(s.photometry) ? '<span class="pill ok">' + esc(s.photometry) + '</span>' : esc(s.photometry)}</p>`;
    if (s.options) {
      h += '<table class="t"><tr><th>Источник</th><th class="num">Поток</th><th class="num">Угол</th><th class="num">Нужно</th><th class="num">Ставим</th><th class="num">Eср, лк</th><th class="num">РРЦ ист.</th></tr>';
      for (const o of s.options) h += `<tr${o.source === s.source ? ' style="background:#fbf7ee"' : ''}><td>${esc(o.source)}</td><td class="num">${o.flux}</td><td class="num">${o.angle}°</td><td class="num">${o.required}</td><td class="num">${o.count}</td><td class="num">${o.E}</td><td class="num">${rub(o.price_source)}</td></tr>`;
      h += '</table>';
    }
    return h;
  }

  /** Чтение файла КП (xlsx/xls/csv) → строки. */
  async function readKPFile(file) {
    const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array' });
    return MT.kpFromSheet(XLSX, wb);
  }


  /* ---------- Фото и таблица результата (подбор, комплекты) ---------- */
  const img = (x, sz = 44) => { const u = x && MT.imgOf(x); return u ? `<img src="${u}" alt="" loading="lazy" width="${sz}" height="${sz}" style="object-fit:contain;border-radius:6px;background:#fff;border:1px solid var(--line)" onerror="this.style.visibility='hidden'">` : ''; };
  /** rows: [{room?, a, qty, note?, group?}] → таблица с фото, ценами и итогом. */
  function rowsHTML(rows, opts = {}) {
    if (!rows || !rows.length) return '<p class="mute">Нет позиций.</p>';
    const { lines, total } = MT.priceKP(rows);
    let h = '<div class="scroll" style="max-height:none"><table class="t"><tr><th></th>' + (opts.room ? '<th>Помещение</th>' : '') + (opts.group ? '<th>Назначение</th>' : '') + '<th>Артикул</th><th>Наименование</th><th class="num">Кол-во</th><th class="num">РРЦ</th><th class="num">Сумма</th><th>Примечание</th>' + (opts.actions ? '<th></th>' : '') + '</tr>';
    lines.forEach((l, i) => { const x = MT.get(l.a);
      h += `<tr data-ri="${i}"><td>${img(x, 40)}</td>${opts.room ? `<td>${esc(l.room || '')}</td>` : ''}${opts.group ? `<td>${esc(l.group || '')}</td>` : ''}<td><b>${esc(l.a)}</b>${l.st === 'Акция' ? ' <span class="pill">Акция</span>' : ''}</td><td>${esc(l.n)}</td><td class="num">${l.qty}</td><td class="num">${rub(l.p)}</td><td class="num">${rub(l.sum)}</td><td class="mute">${esc(l.note || '')}</td>${opts.actions ? `<td><button class="b ghost sm" data-rep="${i}" title="Заменить на другую модель">заменить</button></td>` : ''}</tr>`; });
    return h + `<tr><td colspan="${5 + (opts.room ? 1 : 0) + (opts.group ? 1 : 0)}"><b>Итого</b></td><td class="num"><b>${rub(total)}</b></td><td></td>${opts.actions ? '<td></td>' : ''}</tr></table></div>`;
  }
  const warnHTML = list => (list || []).length ? '<div class="note" style="margin-top:8px">' + list.map(w => '• ' + esc(typeof w === 'string' ? w : w.text)).join('<br>') + '</div>' : '';


  /** Текст PDF построчно (строки собираются по высоте на странице). */
  async function loadPdfJs() {
    if (!window.pdfjsLib) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = window.PDFJS_SRC || 'vendor/pdf.min.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.PDFJS_WORKER || 'vendor/pdf.worker.min.js';
    return pdfjsLib;
  }
  async function pdfLines(file, maxPages = 60) {
    const lib = await loadPdfJs(), pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
      const tc = await (await pdf.getPage(p)).getTextContent(), rows = new Map();
      for (const it of tc.items) { if (!it.str.trim()) continue; const y = Math.round(it.transform[5] / 3) * 3; if (!rows.has(y)) rows.set(y, []); rows.get(y).push([it.transform[4], it.str]); }
      [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, r]) => out.push(r.sort((a, b) => a[0] - b[0]).map(x => x[1]).join(' ').replace(/\s+/g, ' ').trim()));
    }
    return out;
  }
  /** Первая страница PDF картинкой (для подложки плана). */
  async function pdfPageImage(file, page = 1, maxPx = 2400) {
    const lib = await loadPdfJs(), pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise, pg = await pdf.getPage(Math.min(page, pdf.numPages));
    const v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(4, maxPx / Math.max(v0.width, v0.height)) });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise; return { url: c.toDataURL('image/jpeg', 0.85), pages: pdf.numPages, w: c.width, h: c.height };
  }
  /** Общее состояние страницы инструментов (для плана, отчёта, проекта). */
  const TS = window.TS = window.TS || { calcs: [], zones: null, wizard: null, planner: null, kits: [] };


  /* ---------- Библиотека КСС: файл сайта data/photometry.json + свои файлы пользователя (в браузере) ---------- */
  const PKEY = 'maytoni_photometry_v1';
  let userPhot = {}; try { userPhot = JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { }
  async function loadPhotometry() {
    let n = 0; try { const r = await fetch('data/photometry.json'); if (r.ok) n = MT.setPhotometry(await r.json()); } catch (e) { }
    MT.setPhotometry(userPhot, true); return { site: n, user: Object.keys(userPhot).length };
  }
  /** Файлы .ldt/.ies/.zip → в библиотеку по артикулу из имени файла. Возвращает {added:[{file, article}], unmatched:[{file, ph}], errors:[]} */
  async function importPhotometry(files) {
    const out = { added: [], unmatched: [], errors: [] }, items = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        if (!window.fflate) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/fflate.umd.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
        const z = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
        for (const [name, data] of Object.entries(z)) if (/\.(ldt|ies)$/i.test(name)) items.push({ name: name.split('/').pop(), text: new TextDecoder('windows-1251').decode(data) });
      } else if (/\.(ldt|ies)$/i.test(f.name)) items.push({ name: f.name, text: new TextDecoder('windows-1251').decode(await f.arrayBuffer()) });
    }
    const before = Object.keys(MT.photometry).length;
    for (const it of items) {
      try { const ph = MT.parsePhotometry(it.text, it.name), a = MT.articleFromName(it.name) || MT.articleFromName(ph.name);
        if (a) { MT.addPhotometry(a, ph, it.name); userPhot[a.toUpperCase()] = MT.photometry[a.toUpperCase()]; out.added.push({ file: it.name, article: a }); }
        else out.unmatched.push({ file: it.name, ph }); }
      catch (e) { out.errors.push(it.name + ': ' + e.message); }
    }
    try { localStorage.setItem(PKEY, JSON.stringify(Object.fromEntries(Object.entries(userPhot).map(([k, v]) => [k, Object.assign({}, v, { _curve: undefined })])))); } catch (e) { out.errors.push('не хватило места в браузере для сохранения — файлы действуют до перезагрузки'); }
    out.total = Object.keys(MT.photometry).length; out.before = before; return out;
  }
  function clearUserPhotometry() { userPhot = {}; try { localStorage.removeItem(PKEY); } catch (e) { } return loadPhotometry(); }

  window.MTUI = { loadPhotometry, importPhotometry, clearUserPhotometry, pdfLines, pdfPageImage, loadPdfJs, TS, img, rowsHTML, warnHTML, saveFile, $, esc, rub, n1, kp, renderKP, roomCalc, drawMap, calcHTML, readKPFile };
})();
