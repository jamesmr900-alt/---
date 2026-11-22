/* Документы: КП в PDF с фото, монтажная схема PDF, отчёт Word, проект в файле. */
(function () {
  'use strict';
  const { esc, rub } = MTUI;
  const V = window.DOC_VENDOR || { jspdf: 'vendor/jspdf.umd.min.js', docx: 'vendor/docx.umd.js', font: 'vendor/fonts/DejaVuSans.ttf', fontB: 'vendor/fonts/DejaVuSans-Bold.ttf' };
  const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('не загрузился ' + src)); document.head.appendChild(s); });
  const b64 = buf => { let s = '', a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  let fonts = null;
  async function pdf(orientation = 'p') {
    if (!window.jspdf) await loadScript(V.jspdf);
    if (!fonts) { const [r, b] = await Promise.all([fetch(V.font), fetch(V.fontB)]); if (!r.ok) throw new Error('шрифт не загрузился'); fonts = [b64(await r.arrayBuffer()), b64(await b.arrayBuffer())]; }
    const d = new window.jspdf.jsPDF({ orientation, unit: 'mm', format: 'a4' });
    d.addFileToVFS('DejaVu.ttf', fonts[0]); d.addFont('DejaVu.ttf', 'DejaVu', 'normal');
    d.addFileToVFS('DejaVuB.ttf', fonts[1]); d.addFont('DejaVuB.ttf', 'DejaVu', 'bold');
    d.setFont('DejaVu', 'normal'); return d;
  }
  const photoCache = {};
  async function photo(x) {
    const u = x && MT.imgOf(x); if (!u) return null; if (u in photoCache) return photoCache[u];
    try { const r = await fetch(u); if (!r.ok) throw 0; const bl = await r.blob(); photoCache[u] = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(bl); }); }
    catch (e) { photoCache[u] = null; }
    return photoCache[u];
  }
  async function save(doc, name) {
    const blob = doc.output('blob');
    if (!(await MTUI.saveFile(name, blob))) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
  }
  const today = () => new Date().toLocaleDateString('ru-RU');
  const fmt = v => Math.round(v || 0).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';

  /** КП в PDF с фото изделий. opts: {title, customer, manager, note} */
  async function kpPDF(rows, opts = {}) {
    const d = await pdf('p'), W = 210, M = 12, { lines, total } = MT.priceKP(rows);
    let y = M;
    const head = () => { d.setFont('DejaVu', 'bold'); d.setFontSize(15); d.text('MAYTONI', M, y + 5); d.setFont('DejaVu', 'normal'); d.setFontSize(9); d.setTextColor(120);
      d.text(today(), W - M, y + 5, { align: 'right' }); d.setTextColor(0); y += 10; };
    head();
    d.setFont('DejaVu', 'bold'); d.setFontSize(13); d.text(opts.title || 'Коммерческое предложение', M, y + 4); y += 8; d.setFont('DejaVu', 'normal'); d.setFontSize(9);
    if (opts.customer) { d.text('Заказчик: ' + opts.customer, M, y + 3); y += 5; }
    if (opts.manager) { d.text('Подготовил: ' + opts.manager, M, y + 3); y += 5; }
    y += 2;
    const cols = [[M, 8, '№'], [M + 8, 18, 'Фото'], [M + 26, 32, 'Артикул'], [M + 58, 70, 'Наименование'], [M + 128, 14, 'Кол-во'], [M + 142, 22, 'Цена'], [M + 164, 22, 'Сумма']];
    const th = () => { d.setFillColor(240, 238, 233); d.rect(M, y, W - 2 * M, 7, 'F'); d.setFont('DejaVu', 'bold'); d.setFontSize(8); cols.forEach(([x, w, t], i) => d.text(t, i >= 4 ? x + w - 1 : x + 1, y + 4.8, { align: i >= 4 ? 'right' : 'left' })); d.setFont('DejaVu', 'normal'); y += 8; };
    th();
    let room = null, n = 0;
    for (const l of lines) {
      if (l.room !== room) { room = l.room; if (y > 270) { d.addPage(); y = M; th(); } d.setFont('DejaVu', 'bold'); d.setFontSize(9); d.text(room || 'Без помещения', M + 1, y + 4); d.setFont('DejaVu', 'normal'); y += 6; }
      const name = d.splitTextToSize(l.n || '', 68), h = Math.max(16, name.length * 3.6 + 3);
      if (y + h > 282) { d.addPage(); y = M; th(); }
      n++; d.setFontSize(8);
      d.text(String(n), M + 1, y + 5);
      const im = await photo(MT.get(l.a)); if (im) try { d.addImage(im, 'JPEG', M + 9, y + 0.5, 15, 15); } catch (e) { }
      d.text(d.splitTextToSize(l.a, 31), M + 27, y + 5); d.text(name, M + 59, y + 5);
      d.text(String(l.qty), M + 141, y + 5, { align: 'right' }); d.text(l.p ? fmt(l.p) : '—', M + 163, y + 5, { align: 'right' }); d.text(l.sum ? fmt(l.sum) : '—', M + 185, y + 5, { align: 'right' });
      y += h; d.setDrawColor(230); d.line(M, y - 0.5, W - M, y - 0.5);
    }
    if (y > 270) { d.addPage(); y = M; }
    d.setFont('DejaVu', 'bold'); d.setFontSize(11); d.text('Итого: ' + fmt(total), W - M, y + 7, { align: 'right' }); y += 12;
    d.setFont('DejaVu', 'normal'); d.setFontSize(7.5); d.setTextColor(110);
    d.text(d.splitTextToSize((opts.note ? opts.note + ' ' : '') + 'Цены — рекомендованные розничные (РРЦ 2026). Изображения иллюстративные.', W - 2 * M), M, y + 3);
    await save(d, (opts.title || 'КП').replace(/[\\/:*?"<>|]/g, '_') + '.pdf');
  }

  /** Монтажная схема: план с размерами и спецификация светильников. */
  async function mountingPDF(plan, png, legend) {
    const d = await pdf('l'), W = 297, H = 210, M = 10;
    d.setFont('DejaVu', 'bold'); d.setFontSize(13); d.text(`Монтажная схема: ${plan.name}`, M, M + 5);
    d.setFont('DejaVu', 'normal'); d.setFontSize(8.5); d.setTextColor(90);
    d.text(`Помещение ${Math.round(plan.W * 100)} × ${Math.round(plan.L * 100)} см, высота ${Math.round(plan.H * 100)} см. Размеры — в сантиметрах от стен до центров светильников. ${today()}`, M, M + 11); d.setTextColor(0);
    const im = new Image(); im.src = png; await new Promise(ok => { im.onload = ok; });
    const bw = 190, bh = H - M - 22 - 10, k = Math.min(bw / im.width, bh / im.height);
    d.addImage(png, 'JPEG', M, M + 16, im.width * k, im.height * k, undefined, 'FAST');
    let y = M + 18; const x = M + 196;
    d.setFont('DejaVu', 'bold'); d.setFontSize(9.5); d.text('Спецификация', x, y); y += 5; d.setFontSize(8);
    legend.forEach((l, i) => { const t = `${l.key.startsWith('line') ? '—' : i + 1}. ${l.a || ''}`; d.setFont('DejaVu', 'bold'); d.text(t, x, y);
      d.text(l.key.startsWith('line') ? `${l.len.toFixed(2)} м` : `${l.n} шт`, W - M, y, { align: 'right' }); d.setFont('DejaVu', 'normal');
      const nm = d.splitTextToSize(l.name || '', W - M - x); d.text(nm, x, y + 3.6); y += 4 + nm.length * 3.4 + 1.5; });
    y += 3; d.setFontSize(7.5); d.setTextColor(100);
    const notes = ['Монтаж — по проекту электроснабжения; схема не заменяет электропроект.', 'Подвесы: высоту подвеса уточнить по месту (низ ~70–80 см над столешницей).'];
    if (plan.items.some(i => i.t === 'line' && i.kind === 'strip')) notes.push('Лента: блок питания — в доступном месте, питание отрезков длиннее 10 м (24 В) — с нескольких точек.');
    notes.forEach(n => { const t = d.splitTextToSize('• ' + n, W - M - x); d.text(t, x, y); y += t.length * 3.3 + 1; });
    await save(d, `Монтажная схема ${plan.name}.pdf`.replace(/[\\/:*?"<>|]/g, '_'));
  }

  /** Отчёт Word: КП, результаты проверки, замечания, расчёты с картами, планы. */
  async function reportDOCX(opts = {}) {
    if (!window.docx) await loadScript(V.docx);
    const D = window.docx, TS = MTUI.TS;
    const P = (t, o = {}) => new D.Paragraph(Object.assign({ children: [new D.TextRun({ text: String(t ?? ''), bold: o.bold, size: o.size, color: o.color })], spacing: { after: o.after ?? 80 } }, o.heading ? { heading: o.heading } : {}));
    const cell = (t, w, o = {}) => new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, shading: o.head ? { type: D.ShadingType.CLEAR, fill: 'EFEDE8', color: 'auto' } : undefined,
      children: [new D.Paragraph({ alignment: o.right ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT, children: [new D.TextRun({ text: String(t ?? ''), bold: o.head || o.bold, size: 18 })] })] });
    const table = (head, rows, widths, right = []) => new D.Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: D.WidthType.DXA }, columnWidths: widths,
      rows: [new D.TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, widths[i], { head: true, right: right.includes(i) })) }), ...rows.map(r => new D.TableRow({ children: r.map((v, i) => cell(v, widths[i], { right: right.includes(i) })) }))] });
    const imgRun = async (dataUrl, wPx) => { const bin = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0)); const im = new Image(); im.src = dataUrl; await new Promise(ok => { im.onload = ok; });
      const w = Math.min(wPx, im.width), h = Math.round(im.height * w / im.width); return new D.Paragraph({ children: [new D.ImageRun({ type: 'png', data: bin, transformation: { width: w, height: h } })], spacing: { after: 120 } }); };
    const ch = [];
    ch.push(P(opts.title || 'Обоснование подбора освещения', { heading: D.HeadingLevel.TITLE }));
    ch.push(P(`Maytoni · ${today()}`, { color: '777777' }));
    const kpRows = MTUI.kp.get().rows;
    if (kpRows.length) { const { lines, total } = MT.priceKP(kpRows);
      ch.push(P('Коммерческое предложение', { heading: D.HeadingLevel.HEADING_1 }));
      ch.push(table(['Помещение', 'Артикул', 'Наименование', 'Кол-во', 'Цена', 'Сумма'], lines.map(l => [l.room, l.a, l.n, l.qty, l.p ? fmt(l.p) : '—', l.sum ? fmt(l.sum) : '—']), [1700, 1700, 3400, 800, 1100, 1300], [3, 4, 5]));
      ch.push(P('Итого: ' + fmt(total), { bold: true })); }
    if (TS.zones && TS.zones.length) {
      ch.push(P('Проверка освещённости по зонам', { heading: D.HeadingLevel.HEADING_1 }));
      ch.push(P('Оценочный расчёт методом коэффициента использования (СП 52.13330.2016), коэффициент запаса 0,8, отражения 70/50/20. Количество — не меньше 70% от исходного.'));
      ch.push(table(['Помещение', 'Норма', 'Сейчас', 'Вариант 1 (те же корпуса)', 'Вариант 2 (замена)'], TS.zones.map(z => [z.room, z.E + ' лк', z.cur || '—', z.v1 || '—', z.v2 || '—']), [2000, 900, 1900, 2600, 2600]));
    }
    if (TS.rules && TS.rules.length) { ch.push(P('Замечания по комплектации', { heading: D.HeadingLevel.HEADING_1 }));
      TS.rules.forEach(r => ch.push(P(`${r.room}: ${r.text}`, { color: r.level === 'error' ? 'C0392B' : r.level === 'warn' ? '9A6B00' : '444444' }))); }
    if (TS.calcs && TS.calcs.length) { ch.push(P('Светорасчёты', { heading: D.HeadingLevel.HEADING_1 }));
      for (const c of TS.calcs) { const s = c.summary;
        ch.push(P(s.room || 'Помещение', { heading: D.HeadingLevel.HEADING_2 }));
        ch.push(P(`Площадь ${s.area} м², норма ${s.target} лк. ${s.fixture ? s.fixture + ' + ' : ''}${s.source} × ${s.count} шт (нужно по расчёту ${s.required_count}). Средняя освещённость ≈ ${s.E_avg_estimate} лк, Emin ${s.E_min} лк, U0 ${s.U0}. ${s.meets_norm ? 'Норма выполнена.' : 'Ниже нормы.'}`));
        if (c.png) ch.push(await imgRun(c.png, 520)); } }
    if (TS.planner && TS.planner.plans.some(p => p.items.length) && window.PLANNER) {
      ch.push(P('Планы расстановки', { heading: D.HeadingLevel.HEADING_1 }));
      const cur = TS.planner.cur;
      for (let i = 0; i < TS.planner.plans.length; i++) { if (!TS.planner.plans[i].items.length) continue; TS.planner.cur = i;
        ch.push(P(TS.planner.plans[i].name, { heading: D.HeadingLevel.HEADING_2 })); ch.push(await imgRun(window.PLANNER.snapshot(1).toDataURL('image/png'), 600)); }
      TS.planner.cur = cur;
    }
    ch.push(P('Расчёт оценочный и не заменяет светотехнический проект. Цены — РРЦ 2026.', { color: '777777', size: 16 }));
    const doc = new D.Document({ styles: { default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: [{ id: 'Title', name: 'Title', run: { font: 'Arial', size: 36, bold: true }, paragraph: { spacing: { after: 120 } } },
        { id: 'Heading1', name: 'Heading 1', run: { font: 'Arial', size: 28, bold: true }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', run: { font: 'Arial', size: 24, bold: true }, paragraph: { spacing: { before: 180, after: 80 }, keepNext: true } }] },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children: ch }] });
    const blob = await D.Packer.toBlob(doc), name = (opts.title || 'Отчёт по освещению').replace(/[\\/:*?"<>|]/g, '_') + '.docx';
    if (!(await MTUI.saveFile(name, blob))) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
  }

  /** Проект в файл и обратно. */
  function projectData() {
    const TS = MTUI.TS;
    return { app: 'maytoni-tools', v: 1, saved: new Date().toISOString(), kp: MTUI.kp.get(), zones: window.CHK ? window.CHK.get() : null, wizardRooms: TS.wizard ? TS.wizard.rooms : null,
      planner: TS.planner, calcs: (TS.calcs || []).map(c => ({ summary: c.summary })) };
  }
  async function saveProject(name) {
    const blob = new Blob([JSON.stringify(projectData())], { type: 'application/json' }), fn = (name || MTUI.kp.get().title || 'Проект').replace(/[\\/:*?"<>|]/g, '_') + '.maytoni.json';
    if (!(await MTUI.saveFile(fn, blob))) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; a.click(); }
  }
  async function loadProject(file) {
    const j = JSON.parse(await file.text()); if (j.app !== 'maytoni-tools') throw new Error('это не файл проекта комплектатора');
    if (j.kp) MTUI.kp.set(j.kp.rows || [], j.kp.title);
    if (j.zones && window.CHK) window.CHK.set(j.zones);
    if (j.planner) { MTUI.TS.planner = j.planner; window.PLANNER && window.PLANNER.refresh(); }
    if (j.wizardRooms && window.WIZ) window.WIZ.setRooms(j.wizardRooms);
    return j;
  }
  window.MTDOC = { pdf, kpPDF, mountingPDF, reportDOCX, saveProject, loadProject };
})();
