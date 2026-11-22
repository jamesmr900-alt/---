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
    if (p.ldt) { prof.curve = p.ldt.curve; prof.lor = p.ldt.LOR; }
    let res;
    const src = p.source ? MT.get(p.source) : null;
    if (src || p.lm) {                                   // источник задан — считаем как есть
      const lm = +p.lm || src.lm, ang = +p.ang || src?.ang || (prof.cap === 'GX53' ? 120 : 38);
      const beam = p.ldt ? p.ldt.beam : MT.beamFor(prof.mount, ang), lor = +p.lor || prof.lor || MT.lorFor(prof.mount, ang);
      const curve = p.ldt ? p.ldt.curve : MT.beamCurve(beam), F = lm * lor;
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
      <p class="mute">Источник: ${esc(s.source)} ${s.source_name ? '· ' + esc(s.source_name) : ''} · ${s.source_flux} лм, ${s.source_angle}° · КПД светильника ${s.fixture_efficiency}</p>`;
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

  window.MTUI = { saveFile, $, esc, rub, n1, kp, renderKP, roomCalc, drawMap, calcHTML, readKPFile };
})();
