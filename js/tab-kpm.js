/* Вкладка «КП Maytoni»: светильники и треки по чертежу → модели Maytoni → КП по помещениям.
   Модель для каждого значка: артикул из проекта → серия Maytoni из описания → аналог по описанию → подбор по типу; всегда можно поменять. */
(function () {
  'use strict';
  const { $, esc, rub } = MTUI;
  const el = document.querySelector('section[data-p="kpm"]'); if (!el) return;
  const priced = x => x && MT.inPrice(x);
  const isLight = x => x && ['встраиваемый', 'накладной', 'потолочный', 'подвесной', 'настенный', 'трековый', 'трековый подвесной', 'линейный', 'напольный', 'настольный', 'светильник'].includes(MT.kind(x)) && /светильник|бра|люстр|торшер|лампа\s+настольн|спот|прожектор/i.test(x.n || '') && !/фиксатор|креплен|заглушк|коннектор|соединит|основание|подвес\s+тросов|кольцо|рамка|блок\s+питан|конструкц|комплект/i.test(x.n || '');
  const EUI_RX = /розет|выключ|переключ|рамк|заглуш|терморег|домофон|rj45|интернет|usb|hdmi|телевиз|датчик|кнопк|звонок|светорегул/i;
  /** Тип светильника по описанию (для подбора, если модель не найдена). */
  function kindOf(t) {
    const s = String(t || '').toLowerCase();
    if (/трек|трэк|шинопровод/.test(s)) return 'трековый';
    if (/бра|настенн/.test(s)) return 'настенный';
    if (/люстр|подвес|подвеск/.test(s)) return 'подвесной';
    if (/встраив|точечн|спот|downlight|даунлайт|dl\d/.test(s)) return 'встраиваемый';
    if (/накладн|потолочн|plafon|плафон|панел|opal|светодиодн[а-я]*\s+(светильник\s+)?\d|led\s*\d+\s*w/.test(s)) return 'потолочный';
    if (/торшер|напольн/.test(s)) return 'напольный';
    if (/настольн/.test(s)) return 'настольный';
    return MT.detectKind(t) || 'встраиваемый';
  }
  let SERIES = null;
  function seriesIndex() { if (SERIES) return SERIES; SERIES = new Map(); for (const x of MT.catalog) { if (!priced(x) || !x.se || !isLight(x)) continue; const k = x.se.toLowerCase().split(/[\s/]+/)[0]; if (k.length < 3) continue; if (!SERIES.has(k)) SERIES.set(k, []); SERIES.get(k).push(x); } return SERIES; }
  /** Подбор модели по описанию из проекта. Возвращает {a, why, alts:[a…]}. */
  function suggest(label, opt = {}) {
    const t = String(label || ''), cap = (t.match(/\b(GU10|GX53|GU5\.3|MR16|E27|E14|G9)\b/i) || [])[1], w = +((t.match(/(\d+(?:[.,]\d+)?)\s*(?:Вт|W)\b/i) || [])[1] || '0').toString().replace(',', '.');
    const kind = kindOf(t), out = (x, why, alts) => ({ a: x.a, why, alts: [...new Set([x.a, ...(alts || []).map(a => a.a || a)])].slice(0, 8) });
    // 1) артикул Maytoni прямо в описании
    for (const tok of t.split(/[\s;,()]+/)) { const x = tok.length >= 4 && MT.get(tok); if (x && priced(x) && isLight(x)) return out(x, 'артикул из проекта', []); }
    // 2) серия Maytoni из описания («Dot GU10» → Dot)
    const idx = seriesIndex();
    for (const word of (t.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || []).filter(w => !/^(led|gu10|gx53|ip\d+|max|min|dali|smart)$/i.test(w))) {
      const list = idx.get(word.toLowerCase()); if (!list) continue;
      let c = list.filter(x => MT.kind(x) === kind || (kind === 'потолочный' && MT.kind(x) === 'накладной')); if (!c.length) c = list;
      if (cap) { const k = c.filter(x => MT.features(x).cap === cap.toUpperCase()); if (k.length) c = k; }
      if (w) { const k = c.filter(x => x.w && Math.abs(x.w - w) <= Math.max(3, w * 0.3)); if (k.length) c = k; }
      const col = /черн/i.test(t) ? 'черн' : /бел/i.test(t) ? 'бел' : /латун|золот/i.test(t) ? 'латун' : null;
      if (col) { const k = c.filter(x => String(x.col || '').toLowerCase().includes(col)); if (k.length) c = k; }
      const best = KITS.pickTier(c, 'бюджет'); if (best) return out(best, `серия ${best.se} из описания`, c.slice().sort((a, b) => a.p - b.p));
    }
    // 3) аналог по описанию (чужой бренд, но понятны тип, цоколь, мощность)
    try { const r = MT.analogsBySpec(t, 12); let l = (r.list || []).map(o => o.item).filter(x => priced(x) && isLight(x)); if (/люстр/i.test(t)) { const q = l.filter(x => /люстр/i.test(x.n)); l = q.length ? q : l.filter(x => MT.kind(x) === 'подвесной'); } if (l.length && r.kind && !/лента|блок|драйвер/.test(r.kind)) return out(l[0], 'аналог по описанию', l); } catch (e) { }
    // 4) по типу
    let c = MT.catalog.filter(x => priced(x) && MT.kind(x) === kind && isLight(x) && !/трек/i.test(x.c || '') && (kind !== 'трековый' || true));
    if (/люстр/i.test(t)) { const q = c.filter(x => /люстр/i.test(x.n)); if (q.length) c = q; }
    if (cap) { const k = c.filter(x => MT.features(x).cap === cap.toUpperCase()); if (k.length) c = k; }
    if (kind === 'встраиваемый' && !cap && !w) { const k = c.filter(x => MT.features(x).cap === 'GU10'); if (k.length) c = k; }
    if (w && !cap) { const k = c.filter(x => !MT.features(x).cap && x.w && Math.abs(x.w - w) <= Math.max(4, w * 0.35)); if (k.length) c = k; }   // встроенный LED нужной мощности
    const kk = +((t.match(/(\d{4})\s*K/i) || [])[1] || 0); if (kk) { const k = c.filter(x => MT.features(x).cct === kk); if (k.length) c = k; }
    const best = KITS.pickTier(c, 'средний') || c[0];
    return best ? out(best, `подобрано по типу «${kind}»`, c.slice().sort((a, b) => Math.abs(a.p - best.p) - Math.abs(b.p - best.p)).slice(0, 8)) : { a: '', why: 'не найдено', alts: [] };
  }
  let types = [], counts = {}, rooms = [], tracks = [], built = [];
  el.innerHTML = `
  <div class="card"><h3>1. Светильники по чертежу</h3>
    <p class="mute" style="margin-top:0">Сюда передаются значки светильников со вкладки «По чертежу». Модель для каждого значка подобрана по описанию из проекта — проверьте и при необходимости замените (впишите артикул или выберите из вариантов).</p>
    <div class="scroll" style="max-height:none"><table class="t" id="kmTypes"></table></div>
    <div class="row" style="margin-top:8px"><button class="b ghost" onclick="showTab('drw')">← По чертежу</button><button class="b ghost" id="kmAdd">+ строка вручную</button>
      <label style="flex-direction:row;align-items:center;gap:6px;color:var(--ink)"><input type="checkbox" id="kmLamps" checked style="width:auto">добавлять лампы к светильникам под цоколь</label>
      <label>Цвет. темп. ламп<select id="kmCct"><option>3000</option><option>4000</option><option>2700</option></select></label></div>
  </div>
  <div class="card"><h3>2. Количество по помещениям</h3><div class="scroll" style="max-height:none"><table class="t" id="kmCounts"></table></div></div>
  <div class="card"><h3>3. Трековые системы</h3>
    <p class="mute" style="margin-top:0">Трек на чертеже обычно нарисован линией — впишите его здесь: помещение, систему, форму и длины сторон. Светильники трека считаются по числу или по освещённости помещения.</p>
    <div class="scroll" style="max-height:none"><table class="t" id="kmTracks"></table></div>
    <div class="row" style="margin-top:6px"><button class="b ghost" id="kmTrAdd">+ трек</button></div>
  </div>
  <div class="row" style="margin:10px 0"><button class="b" id="kmGo">Собрать КП</button></div>
  <div id="kmOut"></div>`;
  const roomNames = () => [...new Set([...rooms.map(r => r.name), ...Object.keys(counts)])];
  function drawTypes() {
    if (!types.length) { $('#kmTypes').innerHTML = '<tr><td class="mute">Пока пусто: найдите значки на вкладке «По чертежу» и нажмите «Передать в КП Maytoni», или добавьте строку вручную.</td></tr>'; drawCounts(); return; }
    let h = '<tr><th>Значок / описание в проекте</th><th>Модель Maytoni</th><th>Почему эта модель</th><th class="num">Всего, шт</th><th class="num">Цена</th><th></th></tr>';
    types.forEach((t, i) => { const x = MT.get(t.a), tot = Object.values(counts).reduce((s, c) => s + (+c[i] || 0), 0);
      h += `<tr><td><input data-tl="${i}" value="${esc(t.label)}" style="width:260px"></td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap">${x ? MTUI.img(x, 34) : ''}<input data-ta="${i}" value="${esc(t.a || '')}" list="kmAlt${i}" placeholder="артикул" style="width:150px"><datalist id="kmAlt${i}">${(t.alts || []).map(a => { const y = MT.get(a); return `<option value="${esc(a)}">${esc(y ? (y.n || '').slice(0, 70) : '')}</option>`; }).join('')}</datalist></div>
        <div class="mute" style="font-size:12px;max-width:340px">${esc(x ? (x.n || '').slice(0, 90) : 'не выбрано')}</div></td>
        <td class="mute" style="font-size:12px">${esc(t.why || '')}${t.alts && t.alts.length > 1 ? `<br><select data-tsel="${i}" style="font-size:12px;max-width:220px"><option value="">другие варианты…</option>${t.alts.filter(a => a !== t.a).map(a => { const y = MT.get(a); return `<option value="${esc(a)}">${esc(a)} — ${esc(y ? rub(y.p) : '')}</option>`; }).join('')}</select>` : ''}</td>
        <td class="num">${tot}</td><td class="num">${x ? rub(x.p) : '—'}</td><td><button class="b ghost sm" data-tre="${i}" title="Подобрать заново по описанию">↻</button><button class="b ghost sm" data-tdel="${i}">✕</button></td></tr>`; });
    $('#kmTypes').innerHTML = h;
    $('#kmTypes').querySelectorAll('[data-tl]').forEach(x => x.onchange = () => { const t = types[+x.dataset.tl]; t.label = x.value; if (!t.manual) Object.assign(t, suggest(t.label)); drawTypes(); });
    $('#kmTypes').querySelectorAll('[data-ta]').forEach(x => x.onchange = () => { const t = types[+x.dataset.ta], y = MT.get(x.value.trim()); if (y) { t.a = y.a; t.why = 'выбрано вручную'; t.manual = true; } else if (!x.value.trim()) { Object.assign(t, suggest(t.label)); t.manual = false; } drawTypes(); });
    $('#kmTypes').querySelectorAll('[data-tsel]').forEach(x => x.onchange = () => { if (!x.value) return; const t = types[+x.dataset.tsel]; t.a = x.value; t.why = 'выбрано из вариантов'; t.manual = true; drawTypes(); });
    $('#kmTypes').querySelectorAll('[data-tre]').forEach(x => x.onclick = () => { const t = types[+x.dataset.tre]; Object.assign(t, suggest(t.label)); t.manual = false; drawTypes(); });
    $('#kmTypes').querySelectorAll('[data-tdel]').forEach(x => x.onclick = () => { const i = +x.dataset.tdel; types.splice(i, 1); for (const r in counts) { const c = {}; Object.entries(counts[r]).forEach(([k, v]) => { k = +k; if (k < i) c[k] = v; else if (k > i) c[k - 1] = v; }); counts[r] = c; } drawTypes(); });
    drawCounts();
  }
  function drawCounts() {
    const rs = roomNames();
    if (!types.length) { $('#kmCounts').innerHTML = ''; return; }
    let h = `<tr><th>Помещение</th>${types.map(t => `<th style="font-size:12px;max-width:120px">${esc(t.label.slice(0, 40))}</th>`).join('')}</tr>`;
    rs.forEach(r => { h += `<tr><td>${esc(r)}</td>${types.map((t, i) => `<td><input type="number" min="0" data-cr="${esc(r)}|${i}" value="${(counts[r] || {})[i] || ''}" style="width:56px"></td>`).join('')}</tr>`; });
    h += `<tr><td><input id="kmNewRoom" placeholder="+ помещение" style="width:140px"></td><td colspan="${types.length}"></td></tr>`;
    $('#kmCounts').innerHTML = h;
    $('#kmCounts').querySelectorAll('[data-cr]').forEach(x => x.onchange = () => { const [r, i] = x.dataset.cr.split('|'); (counts[r] = counts[r] || {})[i] = Math.max(0, +x.value || 0); drawTypes(); });
    $('#kmNewRoom').onchange = e => { const n = e.target.value.trim(); if (n) { counts[n] = counts[n] || {}; if (!rooms.some(r => r.name === n)) rooms.push({ name: n }); drawCounts(); drawTracks(); } };
  }
  const SYS = () => KITS.trackSystems();
  function drawTracks() {
    const rs = roomNames(), sel = (k, i, v, list) => `<select data-k="${k}" data-tr="${i}">${list.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (!tracks.length) { $('#kmTracks').innerHTML = '<tr><td class="mute">Треков нет.</td></tr>'; return; }
    let h = '<tr><th>Помещение</th><th>Система</th><th>Монтаж</th><th>Форма</th><th>Стороны, м</th><th>Цвет</th><th>Светильников, шт</th><th></th></tr>';
    tracks.forEach((t, i) => { h += `<tr><td>${sel('room', i, t.room, rs.length ? rs : ['Помещение'])}</td><td>${sel('system', i, t.system, SYS())}</td><td>${sel('mount', i, t.mount, ['накладной', 'встраиваемый', 'натяжной', 'подвесной'])}</td><td>${sel('shape', i, t.shape, ['линия', 'Г', 'П', 'квадрат'])}</td>
      <td><input data-k="sides" data-tr="${i}" value="${esc(t.sides)}" style="width:80px" placeholder="3, 2"></td><td>${sel('color', i, t.color, ['черн', 'бел'])}</td><td><input data-k="n" data-tr="${i}" value="${esc(t.n)}" placeholder="авто" style="width:60px"></td><td><button class="b ghost sm" data-trdel="${i}">✕</button></td></tr>`; });
    $('#kmTracks').innerHTML = h;
    $('#kmTracks').querySelectorAll('[data-tr]').forEach(x => x.onchange = () => { tracks[+x.dataset.tr][x.dataset.k] = x.value; });
    $('#kmTracks').querySelectorAll('[data-trdel]').forEach(x => x.onclick = () => { tracks.splice(+x.dataset.trdel, 1); drawTracks(); });
  }
  $('#kmAdd').onclick = () => { types.push(Object.assign({ label: 'Светильник встраиваемый GU10' }, suggest('Светильник встраиваемый GU10'))); drawTypes(); };
  $('#kmTrAdd').onclick = () => { tracks.push({ room: roomNames()[0] || 'Помещение', system: SYS().find(s => /23мм EXILITY$/.test(s)) || SYS()[0], mount: 'накладной', shape: 'линия', sides: '3', color: 'черн', n: '' }); drawTracks(); };
  /** Сборка КП: светильники и лампы по помещениям + треки. */
  function build() {
    const rows = [], warn = [], cct = +$('#kmCct').value, lamps = $('#kmLamps').checked;
    for (const r of roomNames()) types.forEach((t, i) => {
      const n = +(counts[r] || {})[i] || 0, x = MT.get(t.a); if (!n) return;
      if (!x) { warn.push(`${r}: «${t.label}» — модель не выбрана`); return; }
      rows.push({ room: r, a: x.a, qty: n, note: 'по чертежу: ' + t.label, group: ['встраиваемый', 'накладной', 'потолочный'].includes(MT.kind(x)) ? 'Общий свет' : MT.kind(x) === 'настенный' ? 'Бра' : 'Декоративный свет' });
      const f = MT.features(x); if (t.lamp && MT.get(t.lamp)) rows.push({ room: r, a: MT.get(t.lamp).a, qty: n * (f.nl || 1), note: `лампы к ${x.a} (из проекта)`, group: 'Лампы' }); else if (lamps && f.cap) { const lp = KITS.lampFor(f.cap, cct) || KITS.lampFor(f.cap); if (lp) rows.push({ room: r, a: lp.a, qty: n * (f.nl || 1), note: `лампы ${f.cap} к ${x.a}`, group: 'Лампы' }); else warn.push(`${x.a}: лампа ${f.cap} не найдена`); }
    });
    for (const t of tracks) {
      const sides = String(t.sides).split(/[,;\s]+/).map(v => parseFloat(v.replace(',', '.'))).filter(v => v > 0), geo = KITS.trackShape(t.shape, sides);
      if (!geo) { warn.push(`${t.room}: трек — впишите длины сторон`); continue; }
      const total = geo.runs.reduce((a, b) => a + b, 0), n = +t.n > 0 ? +t.n : Math.max(2, Math.ceil(total / 0.8));
      const tf = KITS.trackFixture(t.system, t.color, cct, null, 'средний');
      const tr = KITS.trackCalc({ system: t.system, mount: t.mount, color: t.color, runs: geo.runs, L: geo.L, fixtures: tf ? [{ a: tf.a, qty: n }] : [], room: t.room });
      if (tr.error) { warn.push(`${t.room}: ${tr.error}`); continue; }
      tr.rows.forEach(x => rows.push({ room: t.room, a: x.a, qty: x.qty, note: x.note, group: `Трек ${t.system.split(' ').pop()}` }));
      (tr.warn || []).filter(w => !/Проверьте по каталогу/.test(w)).forEach(w => warn.push(`${t.room}, трек: ${w}`));
    }
    return { rows, warn };
  }
  $('#kmGo').onclick = () => {
    const { rows, warn } = build(); built = rows;
    if (!rows.length) { $('#kmOut').innerHTML = `<div class="card">${MTUI.warnHTML(warn.length ? warn : ['Нет позиций: проверьте количество по помещениям.'])}</div>`; return; }
    const total = rows.reduce((s, r) => s + (MT.get(r.a) ? MT.get(r.a).p || 0 : 0) * r.qty, 0);
    let h = '<div class="card"><h3>КП Maytoni по помещениям</h3><div class="scroll"><table class="t"><tr><th>Помещение</th><th></th><th>Артикул</th><th>Наименование</th><th class="num">Кол-во</th><th class="num">РРЦ</th><th class="num">Сумма</th><th>Примечание</th></tr>', room = null;
    rows.slice().sort((a, b) => a.room.localeCompare(b.room, 'ru')).forEach(r => { const x = MT.get(r.a); h += `<tr><td>${r.room !== room ? esc(room = r.room) : ''}</td><td>${MTUI.img(x, 30)}</td><td>${esc(r.a)}</td><td>${esc(x ? (x.n || '').slice(0, 80) : '')}</td><td class="num">${r.qty}</td><td class="num">${rub(x ? x.p : 0)}</td><td class="num">${rub((x ? x.p : 0) * r.qty)}</td><td class="mute" style="font-size:12px">${esc(r.note || '')}</td></tr>`; });
    h += `<tr><td colspan="6"><b>Итого</b></td><td class="num"><b>${rub(total)}</b></td><td></td></tr></table></div>${warn.length ? MTUI.warnHTML(warn) : ''}
      <div class="row"><button class="b" id="kmToKp">Добавить в КП</button><button class="b ghost" id="kmToPr" title="Помещения и светильники станут рабочим вариантом: по ним — светорасчёт, план и 3D">Сделать рабочим вариантом</button><button class="b ghost" id="kmXlsx">Excel</button></div></div>`;
    $('#kmOut').innerHTML = h;
    $('#kmToKp').onclick = () => { const kr = built.map(r => Object.assign({}, r, { group: r.group })); if (window.PROJECT && PROJECT.data) { const d = PROJECT.data; d.rows = d.rows.filter(x => !String(x.note || '').startsWith('по чертежу') && !/^Трек |^Лампы$/.test(x.group || '')).concat(kr); roomNames().forEach(n => { if (!d.rooms.some(r => r.name === n)) d.rooms.push(Object.assign({ name: n, H: 2.75 }, rooms.find(r => r.name === n) || {})); }); PROJECT.sync(); } else MTUI.kp.add(kr); $('#kmToKp').textContent = `В КП: ${kr.length} поз.`; MTUI.toast && MTUI.toast('Светильники добавлены в КП'); };
    $('#kmToPr').onclick = () => { PROJECT.set(roomNames().map(n => Object.assign({ name: n, H: 2.75 }, rooms.find(r => r.name === n) || {}, { name: n })), built, 'КП Maytoni по чертежу'); MTUI.toast && MTUI.toast('Рабочий вариант собран: светорасчёт, план и 3D обновлены'); };
    $('#kmXlsx').onclick = async () => { const aoa = [['Помещение', 'Артикул', 'Наименование', 'Кол-во', 'Цена (РРЦ), ₽', 'Сумма, ₽', 'Примечание'], ...built.map(r => { const x = MT.get(r.a); return [r.room, r.a, x ? x.n : '', r.qty, x ? x.p : 0, (x ? x.p : 0) * r.qty, r.note || '']; })];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'КП Maytoni'); const fn = 'КП Maytoni по чертежу.xlsx';
      if (await MTUI.saveFile(fn, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]))) return; XLSX.writeFile(wb, fn); };
  };
  /** Из «По чертежу»: list — [{label, a?}], cnt — {помещение: {индекс: n}}, rs — [{name, S}]. */
  function setFromDrawing(list, cnt, rs) {
    types = list.map(t => { const s = t.a && MT.get(t.a) ? { a: MT.get(t.a).a, why: t.why || 'выбрано на чертеже', alts: suggest(t.label).alts, manual: !!t.manual } : suggest(t.label); return Object.assign({ label: t.label, lamp: t.lamp || '' }, s); });
    counts = cnt; rooms = rs || []; built = []; $('#kmOut').innerHTML = ''; drawTypes(); drawTracks();
  }
  drawTypes(); drawTracks();
  window.KPM = { suggest, kindOf, setFromDrawing, build: () => build(), get types() { return types; }, get counts() { return counts; }, EUI_RX };
})();
