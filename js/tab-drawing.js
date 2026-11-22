/* Вкладка «По чертежу»: лист PDF проекта → значки → количество по помещениям → КП.
   ЭУИ (розетки, выключатели): образцы берутся из экспликации механизмов, рамки — по значкам вплотную.
   Свет: образцы из условных обозначений; модель для каждого значка выбирается из каталога.
   Любое количество можно поправить вручную (пусто — авто). */
(function () {
  'use strict';
  const { $, esc } = MTUI;
  const el = document.querySelector('section[data-p="drw"]'); if (!el) return;
  const SC = 3;   // масштаб рендера листа: 3 px на pt (тонкие линии значков различимы)
  const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#800000', '#808000', '#000075', '#bfef45', '#fabed4'];
  const st = { doc: null, page: 0, cv: null, ink: null, items: [], mode: 'eui', samples: [], dets: [], rooms: [], zones: null, walls: null, region: null, view: { s: 0.4, x: 0, y: 0 }, tool: 'pan', selSample: 0, selRoom: 0, manual: {}, frameMan: {}, titles: [] };
  el.innerHTML = `
  <div class="card"><h3>1. Лист проекта</h3>
    <div class="row">
      <label class="b ghost" style="cursor:pointer">PDF проекта…<input type="file" id="dPdf" accept=".pdf" hidden></label>
      <label>Лист<select id="dPage" style="min-width:320px"><option value="">— загрузите PDF —</option></select></label>
      <label>Что считаем<select id="dMode"><option value="eui">розетки и выключатели (ЭУИ)</option><option value="light">светильники</option></select></label>
      <button class="b" id="dOpen">Открыть лист</button>
      <span class="mute" id="dMsg">Подойдёт план розеток и выключателей или план светильников. Образцы значков берутся из экспликации / условных обозначений на этом же листе.</span>
    </div></div>
  <div class="card" id="dWork" hidden>
    <div class="row" style="margin-bottom:6px;gap:6px">
      <b>Инструмент:</b>
      <button class="b sm" data-tool="pan" title="Перетаскивание листа, колесо — масштаб">✋ просмотр</button>
      <button class="b ghost sm" data-tool="sample" title="Обведите рамкой один значок — он станет образцом">▭ образец</button>
      <button class="b ghost sm" data-tool="add" title="Щелчок — добавить значок выбранного образца (если не нашёлся)">＋ значок</button>
      <button class="b ghost sm" data-tool="del" title="Щелчок по найденному значку — удалить (ложное срабатывание)">✕ значок</button>
      <button class="b ghost sm" data-tool="room" title="Щелчок — поставить метку выбранного помещения">⌖ помещение</button>
      <button class="b ghost sm" data-tool="region" title="Рамка — где искать (по умолчанию весь план без штампа и таблиц)">◫ область</button>
      <span style="flex:1"></span>
      <label style="flex-direction:row;align-items:center;gap:4px">точность <input type="range" id="dThr" min="0.5" max="0.95" step="0.01" value="0.72" style="width:110px;padding:0"><span id="dThrV">0.72</span></label>
      <button class="b" id="dFind">Найти значки</button>
      <button class="b ghost sm" id="dZoomFit">⤢</button>
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:10px">
      <div style="position:relative"><canvas id="dCv" style="width:100%;height:68vh;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:grab;touch-action:none"></canvas>
        <div id="dProg" class="mute" style="position:absolute;left:10px;bottom:8px;background:rgba(255,255,255,.9);padding:3px 8px;border-radius:6px" hidden></div></div>
      <div style="max-height:68vh;overflow:auto">
        <b>Образцы значков</b><div id="dSamples" class="mute" style="font-size:13px">—</div>
        <b style="display:block;margin-top:10px">Помещения</b>
        <div class="row" style="gap:4px;margin:4px 0"><button class="b ghost sm" id="dRoomAdd">+ помещение</button><button class="b ghost sm" id="dRoomAuto">из экспликации помещений</button></div>
        <div id="dRooms" class="mute" style="font-size:13px">—</div>
      </div>
    </div>
  </div>
  <div class="card" id="dGroups" hidden></div>
  <div id="dOut"></div>`;
  const cv = $('#dCv'), ctx = cv.getContext('2d');
  const setMsg = t => { $('#dMsg').textContent = t; };
  const prog = t => { const p = $('#dProg'); p.hidden = !t; p.textContent = t || ''; };

  /* ---------- загрузка ---------- */
  $('#dPdf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    setMsg('Читаю PDF…');
    try {
      st.doc = await SYM.open(f); st.titles = [];
      let bestE = 0, bestL = 0;
      for (let i = 1; i <= st.doc.numPages; i++) {
        const { items } = await SYM.pageItems(st.doc, i, 1), all = items.map(x => x.s).join(' ');
        const t = (all.match(/План.{5,110}?(?:\(\d\s*этаж\)|\d-го этажа)/i) || [SYM.title(items)])[0].slice(0, 110);
        const kind = /экспликац[а-я]*\s+механизм|электроустановочн[а-я]*\s+оборудован|план[а-я ,.]{0,40}розет/i.test(all) ? 'eui' : /расстановки\s+светильник|привязки\s+осветит|план\s+освещени|осветительн[а-я]*\s+прибор/i.test(all) ? 'light' : /экспликац[а-я]*\s+помещени/i.test(all) ? 'rooms' : '';
        st.titles.push({ n: i, t, kind, floor: SYM.floorOf(t || all) });
        if (kind === 'eui' && !bestE) bestE = i; if (kind === 'light' && !bestL) bestL = i;
        if (i % 10 === 0) setMsg(`Читаю листы: ${i} из ${st.doc.numPages}…`);
      }
      $('#dPage').innerHTML = st.titles.map(p => `<option value="${p.n}">${p.n}. ${esc(p.t || 'без названия')}${p.kind === 'eui' ? ' — ЭУИ' : p.kind === 'light' ? ' — свет' : ''}</option>`).join('');
      const pick = st.mode === 'light' && bestL ? bestL : bestE || bestL || 1; $('#dPage').value = pick;
      $('#dMode').value = st.titles[pick - 1].kind === 'light' ? 'light' : 'eui';
      setMsg(`Листов: ${st.doc.numPages}. Выбран лист ${pick}. Нажмите «Открыть лист».`);
    } catch (err) { setMsg('Не удалось прочитать PDF: ' + err.message); }
  };
  $('#dPage').onchange = () => { const p = st.titles[+$('#dPage').value - 1]; if (p && (p.kind === 'eui' || p.kind === 'light')) $('#dMode').value = p.kind; };
  $('#dOpen').onclick = async () => {
    if (!st.doc) { setMsg('Сначала загрузите PDF.'); return; }
    st.page = +$('#dPage').value; st.mode = $('#dMode').value; setMsg('Открываю лист…');
    st.cv = await SYM.render(st.doc, st.page, SC); st.ink = SYM.ink(st.cv);
    const pi = await SYM.pageItems(st.doc, st.page, SC); st.items = pi.items;
    st.samples = []; st.dets = []; st.rgb = null; st.manual = {}; st.frameMan = {}; st.region = null; st.walls = null; st.zones = null;
    // образцы из экспликации / условных обозначений
    const lg = SYM.legendRows(st.items, pi.W);
    st.frameLbl = SYM.frameLabels(st.items);
    st.panelX = lg.panelX;
    for (const r of lg.rows) {
      const bb = SYM.cropIcon(st.ink, r.icon); if (!bb) continue;
      addSample(r.label, bb, r.qty);
    }
    // область поиска: план без правой панели и без примечаний внизу
    const notes = st.items.find(i => /^Примечани/i.test(i.s) && (!st.panelX || i.x < st.panelX * 0.6) && i.y > st.cv.height * 0.55);
    // таблица обозначений справа сверху — исключить полосу справа целиком; таблица ниже середины — исключить только её прямоугольник до низа листа
    st.exclude = [];
    if (st.panelX && lg.head) { if (lg.head.y < st.cv.height * 0.3) st.exclude.push({ x0: st.panelX, y0: 0, x1: st.cv.width, y1: st.cv.height }); else st.exclude.push({ x0: st.panelX, y0: lg.head.y - lg.head.h * 0.6, x1: st.cv.width, y1: st.cv.height }); }
    st.region = { x0: 0, y0: 0, x1: st.cv.width, y1: notes ? notes.y - notes.h * 1.5 : st.cv.height };
    $('#dWork').hidden = false; fit(); drawSamples(); draw();
    await autoRooms();
    setMsg(`Лист ${st.page}: образцов из таблицы — ${st.samples.length}${lg.rows.length > st.samples.length ? ` (из ${lg.rows.length} строк)` : ''}, помещений — ${st.rooms.length}. Проверьте образцы и нажмите «Найти значки». Если значок не взялся — инструмент «образец».`);
  };
  function addSample(label, bb, qty) {
    const i = st.samples.length, c = SYM.cut(st.ink, bb);
    const fr = /рамк/i.test(label) ? +((label.match(/(\d)\s*-?\s*пост/i) || label.match(/(\d)/) || [])[1] || 0) : 0;
    const s = { label, bb, qty, g: c.g, w: c.w, h: c.h, color: COLORS[i % COLORS.length], on: !fr, frame: fr || 0 };
    if (st.mode === 'eui') s.vid = fr ? '' : window.VOLTUM ? (VOLTUM.mapType(label).id || '') : '';
    else { s.a = ''; try { const r = MT.analogsBySpec(label, 1); if (r.list && r.list[0]) s.a = r.list[0].item.a; } catch (e) { } }
    st.samples.push(s); return s;
  }
  /* ---------- помещения ---------- */
  async function autoRooms() {
    st.rooms = [];
    const cur = st.titles[st.page - 1], floor = cur ? cur.floor : 0, base = await st.doc.getPage(st.page), bvp = base.getViewport({ scale: 1 });
    let best = null;
    const cands = st.titles.filter(p => p.kind === 'rooms' || p.n === st.page).sort((a, b) => (b.floor === floor) - (a.floor === floor));
    for (const p of cands) {
      if (floor && p.floor && p.floor !== floor) continue;
      const pg = await st.doc.getPage(p.n), vp = pg.getViewport({ scale: 1 }); if (Math.abs(vp.width - bvp.width) > 2 || Math.abs(vp.height - bvp.height) > 2) continue;
      const { items, W } = await SYM.pageItems(st.doc, p.n, SC), tab = SYM.roomTable(items); if (tab.length < 2) continue;
      const lg = SYM.legendRows(items, W), nums = SYM.roomNumbers(items, tab, lg.panelX);
      const score = nums.size / tab.length; if (!best || score > best.score) best = { score, tab, nums, n: p.n };
      if (score > 0.8) break;
    }
    if (best) { const cnt = {}; best.tab.forEach(r => { cnt[r.name] = (cnt[r.name] || 0) + 1; });
      best.tab.forEach(r => { const p = best.nums.get(r.no); st.rooms.push({ name: cnt[r.name] > 1 ? `${r.name} (пом. ${r.no})` : r.name, S: r.S, no: r.no, x: p ? p.x : null, y: p ? p.y : null }); }); }
    st.roomSrc = best ? best.n : null;
    rebuildZones(); drawRooms(); draw();
  }
  function rebuildZones() {
    const placed = st.rooms.filter(r => r.x != null);
    if (!placed.length || !st.cv) { st.zones = null; return; }
    st.walls = st.walls || SYM.walls(st.cv, 4);
    st.zones = SYM.zones(st.walls, placed); st.zones.map = placed.map(r => st.rooms.indexOf(r));
    assignRooms();
  }
  function assignRooms() { st.dets.forEach(d => { const z = st.zones ? st.zones.at(d.x + d.w / 2, d.y + d.h / 2) : -1; d.room = z >= 0 ? st.zones.map[z] : -1; }); }
  function drawRooms() {
    const b = $('#dRooms');
    if (!st.rooms.length) { b.innerHTML = 'Помещения не найдены. Добавьте вручную и поставьте метки на план (инструмент «помещение»). Без помещений всё попадёт в «Весь объект».'; return; }
    b.innerHTML = (st.roomSrc && st.roomSrc !== st.page ? `<div style="margin-bottom:4px">Номера и названия — с листа ${st.roomSrc}. Проверьте, что метки стоят в своих помещениях.</div>` : '') +
      st.rooms.map((r, i) => `<div class="row" style="gap:4px;margin:2px 0;${i === st.selRoom ? 'background:#fff6e0;border-radius:6px' : ''}"><input type="radio" name="dSelRoom" data-sr="${i}" ${i === st.selRoom ? 'checked' : ''} style="width:auto">
        <input data-rn="${i}" value="${esc(r.name)}" style="width:150px;font-size:12px"><span style="width:44px">${r.S ? r.S + ' м²' : ''}</span><span title="${r.x != null ? 'метка на плане' : 'нет метки — выберите и щёлкните на плане инструментом «помещение»'}">${r.x != null ? '⌖' : '⚠'}</span><button class="b ghost sm" data-rd="${i}">✕</button></div>`).join('');
    b.querySelectorAll('[data-sr]').forEach(x => x.onchange = () => { st.selRoom = +x.dataset.sr; setTool('room'); drawRooms(); });
    b.querySelectorAll('[data-rn]').forEach(x => x.onchange = () => { st.rooms[+x.dataset.rn].name = x.value; results(); draw(); });
    b.querySelectorAll('[data-rd]').forEach(x => x.onclick = () => { st.rooms.splice(+x.dataset.rd, 1); st.selRoom = 0; rebuildZones(); drawRooms(); results(); draw(); });
  }
  $('#dRoomAdd').onclick = () => { st.rooms.push({ name: 'Помещение ' + (st.rooms.length + 1), S: null, x: null, y: null }); st.selRoom = st.rooms.length - 1; setTool('room'); drawRooms(); };
  $('#dRoomAuto').onclick = () => autoRooms().then(() => results());
  /* ---------- образцы ---------- */
  function drawSamples() {
    const b = $('#dSamples');
    if (!st.samples.length) { b.innerHTML = 'Образцов нет: обведите значок инструментом «образец».'; return; }
    const V = window.VOLTUM && VOLTUM.catalog;
    b.innerHTML = st.samples.map((s, i) => {
      const found = st.dets.filter(d => d.ti === i && !d.off).length;
      const map = s.frame ? `<span class="mute" style="font-size:12px">рамка на ${s.frame} пост${s.frame === 1 ? '' : 'а'} — считается по значкам вплотную${st.frameLbl && st.frameLbl.length ? ' и подписям «Р-0N»' : ''}</span>` : st.mode === 'eui'
        ? `<select data-sv="${i}" style="font-size:12px;width:100%"><option value="">— не считать —</option>${V ? V.items.map(it => `<option value="${it.id}"${it.id === s.vid ? ' selected' : ''}>${esc(it.n)}</option>`).join('') : ''}</select>`
        : `<input data-sa="${i}" value="${esc(s.a || '')}" placeholder="артикул Maytoni" style="font-size:12px;width:130px"> <span class="mute" style="font-size:11px">${esc(((MT.get(s.a) || {}).n || '').slice(0, 40))}</span>`;
      return `<div style="border-top:1px solid var(--line);padding:4px 0;${i === st.selSample ? 'background:#f2f7ff' : ''}" data-ss="${i}">
        <div class="row" style="gap:5px;align-items:center"><input type="checkbox" data-son="${i}" ${s.on ? 'checked' : ''} style="width:auto"><canvas data-th="${i}" width="40" height="28" style="border:2px solid ${s.color};border-radius:4px;background:#fff"></canvas>
        <input data-sl="${i}" value="${esc(s.label)}" style="flex:1;font-size:12px"><button class="b ghost sm" data-sx="${i}" title="удалить образец">✕</button></div>
        <div style="font-size:12px;margin:2px 0 0 24px">найдено <b>${found}</b>${s.qty != null ? ` из ${s.qty} по экспликации${found !== s.qty && st.dets.length ? ` <span style="color:#c0392b">(${found > s.qty ? '+' : ''}${found - s.qty})</span>` : ''}` : ''}</div>
        <div style="margin:2px 0 0 24px">${map}</div></div>`;
    }).join('');
    st.samples.forEach((s, i) => { const c = b.querySelector(`[data-th="${i}"]`).getContext('2d'), k = Math.min(40 / s.w, 28 / s.h); c.drawImage(st.cv, s.bb.x, s.bb.y, s.bb.w, s.bb.h, (40 - s.w * k) / 2, (28 - s.h * k) / 2, s.w * k, s.h * k); });
    b.querySelectorAll('[data-ss]').forEach(x => x.onclick = e => { if (e.target.closest('input,select,button')) return; st.selSample = +x.dataset.ss; drawSamples(); });
    b.querySelectorAll('[data-son]').forEach(x => x.onchange = () => { st.samples[+x.dataset.son].on = x.checked; draw(); results(); });
    b.querySelectorAll('[data-sl]').forEach(x => x.onchange = () => { st.samples[+x.dataset.sl].label = x.value; results(); });
    b.querySelectorAll('[data-sv]').forEach(x => x.onchange = () => { st.samples[+x.dataset.sv].vid = x.value; results(); });
    b.querySelectorAll('[data-sa]').forEach(x => x.onchange = () => { const v = x.value.trim(), it = MT.get(v); st.samples[+x.dataset.sa].a = it ? it.a : v; drawSamples(); results(); });
    b.querySelectorAll('[data-sx]').forEach(x => x.onclick = () => { const i = +x.dataset.sx; st.samples.splice(i, 1); st.dets = st.dets.filter(d => d.ti !== i).map(d => (d.ti > i ? Object.assign(d, { ti: d.ti - 1 }) : d)); st.selSample = 0; drawSamples(); draw(); results(); });
  }
  /* ---------- поиск ---------- */
  $('#dThr').oninput = e => { $('#dThrV').textContent = e.target.value; };
  $('#dFind').onclick = async () => {
    const act = st.samples.map((s, i) => ({ s, i })).filter(o => o.s.on);
    if (!act.length) { setMsg('Нет образцов для поиска.'); return; }
    $('#dFind').disabled = true; prog('Ищу значки… 0%');
    try {
      st.rgb = st.rgb || SYM.rgbOf(st.cv);
      let byC = SYM.findByColor(st.rgb, st.cv.width, st.cv.height, st.ink, act.map(o => o.s), st.region);
      // значки на плане мельче/крупнее, чем в таблице: перерисовать лист в их масштабе и взять образцы оттуда
      const k = byC.size && byC.tplSize ? (byC.size + 2) / (byC.tplSize + 2) : 1;
      if (SYM.cfg.rescale !== false && Math.abs(k - 1) > 0.08 && k > 0.3 && k < 3) {
        prog('Уточняю образцы…');
        const cv2 = await SYM.render(st.doc, st.page, SC * k), ink2 = SYM.ink(cv2), rgb2 = SYM.rgbOf(cv2);
        const bbs = act.map(o => { const b = o.s.bb, m = 3; return SYM.cropIcon(ink2, { x0: b.x * k - m, x1: (b.x + b.w) * k + m, y0: b.y * k - m, y1: (b.y + b.h) * k + m }) || { x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.max(4, Math.round(b.w * k)), h: Math.max(4, Math.round(b.h * k)) }; });
        st._tpl = { cv2, bbs, k }; byC = SYM.findByColor(st.rgb, st.cv.width, st.cv.height, st.ink, act.map(o => o.s), st.region, { rgb: rgb2, W: cv2.width, ink: ink2, bbs });
      }
      st.symSize = [byC.size, byC.tplSize, st._tpl ? st._tpl.k : 1]; let found = byC.found.map(d => Object.assign(d, { ti: act[d.ti].i }));
      const rest = byC.noColor.map(k => act[k]);   // чёрно-белые образцы — поиск по рисунку
      if (rest.length) { const f2 = await SYM.find(st.ink, rest.map(o => o.s), +$('#dThr').value, st.region, p => prog(`Ищу значки… ${Math.round(p * 100)}%`));
        f2.forEach(d => { d.ti = rest[d.ti].i; if (!found.some(o => Math.abs(o.x + o.w / 2 - d.x - d.w / 2) < o.w * 0.6 && Math.abs(o.y + o.h / 2 - d.y - d.h / 2) < o.h * 0.6)) found.push(d); }); }
      // значки внутри ячеек таблицы-экспликации не считаем
      st.dets = found.filter(d => !(st.exclude || []).some(e => d.x + d.w / 2 > e.x0 && d.x + d.w / 2 < e.x1 && d.y + d.h / 2 > e.y0 && d.y + d.h / 2 < e.y1)).filter(d => !st.samples.some(s => d.x < s.bb.x + s.bb.w && d.x + d.w > s.bb.x && d.y < s.bb.y + s.bb.h && d.y + d.h > s.bb.y));
      assignRooms();
      setMsg(`Найдено значков: ${st.dets.length}. Сверьте с экспликацией (справа), удалите лишние («✕ значок»), добавьте пропущенные («＋ значок»). Количество по помещениям — ниже, его можно поправить вручную.`);
    } catch (err) { setMsg('Поиск не удался: ' + err.message); }
    prog(''); $('#dFind').disabled = false; drawSamples(); draw(); drawGroups(); results();
  };
  /* ---------- группы одинаковых значков: тип проверяется и меняется сразу для всей группы ---------- */
  function drawGroups() {
    const b = $('#dGroups'); if (!st.dets.length) { b.hidden = true; return; }
    const g = new Map(); st.dets.forEach(d => { const k = d.grp || ('t' + d.ti); if (!g.has(k)) g.set(k, []); g.get(k).push(d); });
    const list = [...g.entries()].sort((p, q) => q[1].length - p[1].length);
    const opts = st.samples.map((s, i) => s.frame ? '' : `<option value="${i}">${esc(s.label.slice(0, 50))}</option>`).join('');
    b.hidden = false;
    b.innerHTML = `<h3>2. Проверьте группы значков</h3><p class="mute" style="margin-top:0">Одинаковые на плане значки собраны в группы. Если тип определён неверно — выберите правильный: он сменится у всей группы. «показать» — подсветить на плане.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${list.map(([k, ds], j) => { const mg = ds.reduce((t, d) => t + (d.margin ?? 1), 0) / ds.length, unsure = mg < 0.08; return `<div style="border:${unsure ? '2px solid #e67e22' : '1px solid var(--line)'};border-radius:8px;padding:5px;width:190px" title="${unsure ? 'Похоже сразу на несколько обозначений — проверьте' : ''}"><div class="row" style="gap:6px;align-items:center"><canvas data-gt="${j}" width="44" height="44" style="border:1px solid #ddd;border-radius:4px"></canvas><div><b>${ds.length} шт</b>${unsure ? ' <span style="color:#e67e22;font-size:12px">проверьте</span>' : ''}<br><a href="#" data-gs="${j}" style="font-size:12px">показать</a></div></div>
        <select data-gsel="${j}" style="width:100%;font-size:12px;margin-top:4px"><option value="-1">— не считать —</option>${opts}</select></div>`; }).join('')}</div>`;
    list.forEach(([k, ds], j) => { const d = ds[0], c = b.querySelector(`[data-gt="${j}"]`).getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 44, 44); const m = Math.max(d.w, d.h) * 0.25; c.drawImage(st.cv, d.x - m, d.y - m, d.w + 2 * m, d.h + 2 * m, 0, 0, 44, 44);
      const sel = b.querySelector(`[data-gsel="${j}"]`); sel.value = ds.every(x => x.off) ? '-1' : String(d.ti);
      sel.onchange = () => { const v = +sel.value; ds.forEach(x => { if (v < 0) x.off = true; else { x.off = false; x.ti = v; } }); drawSamples(); draw(); results(); };
      b.querySelector(`[data-gs="${j}"]`).onclick = e => { e.preventDefault(); st.hl = ds; const r = cv.getBoundingClientRect(); st.view.s = Math.max(st.view.s, 0.6); st.view.x = r.width / 2 - (d.x + d.w / 2) * st.view.s; st.view.y = r.height / 2 - (d.y + d.h / 2) * st.view.s; draw(); cv.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
  }
  /* ---------- просмотр ---------- */
  function fit() { const r = cv.getBoundingClientRect(); if (!st.cv || !r.width) return; const s = Math.min(r.width / st.cv.width, r.height / st.cv.height); st.view = { s, x: (r.width - st.cv.width * s) / 2, y: (r.height - st.cv.height * s) / 2 }; }
  $('#dZoomFit').onclick = () => { fit(); draw(); };
  const toImg = (mx, my) => [(mx - st.view.x) / st.view.s, (my - st.view.y) / st.view.s];
  function draw() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; if (!r.width) return;
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height); if (!st.cv) return;
    ctx.save(); ctx.translate(st.view.x, st.view.y); ctx.scale(st.view.s, st.view.s);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(st.cv, 0, 0);
    const lw = 1.5 / st.view.s;
    (st.exclude || []).forEach(e => { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(e.x0, e.y0, e.x1 - e.x0, e.y1 - e.y0); });
    if (st.region) { ctx.strokeStyle = 'rgba(0,120,255,.5)'; ctx.setLineDash([8 / st.view.s, 6 / st.view.s]); ctx.lineWidth = lw; ctx.strokeRect(st.region.x0, st.region.y0, st.region.x1 - st.region.x0, st.region.y1 - st.region.y0); ctx.setLineDash([]); }
    st.samples.forEach(s => { ctx.strokeStyle = s.color; ctx.lineWidth = lw * 1.5; ctx.strokeRect(s.bb.x, s.bb.y, s.bb.w, s.bb.h); });
    // рамки ЭУИ
    if (st.mode === 'eui') for (const cl of frameClusters()) { if (cl.length < 2) continue; const ds = cl.map(i => st.dets[i]); const x0 = Math.min(...ds.map(d => d.x)), y0 = Math.min(...ds.map(d => d.y)), x1 = Math.max(...ds.map(d => d.x + d.w)), y1 = Math.max(...ds.map(d => d.y + d.h));
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = lw; ctx.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6); ctx.fillStyle = '#000'; ctx.font = `${11 / st.view.s}px system-ui`; ctx.fillText(cl.length + ' п.', x1 + 4, y0 + 10 / st.view.s); }
    for (const d of st.dets) { const s = st.samples[d.ti]; if (!s || !s.on || d.off) continue; ctx.strokeStyle = s.color; ctx.lineWidth = lw * 1.6; ctx.strokeRect(d.x, d.y, d.w, d.h); if (d.manual) { ctx.fillStyle = s.color; ctx.fillRect(d.x, d.y - 4 / st.view.s, 4 / st.view.s, 4 / st.view.s); } }
    // зоны помещений: цветная точка у значка
    st.rooms.forEach((rm, i) => { if (rm.x == null) return; ctx.fillStyle = i === st.selRoom ? '#e67e22' : '#2c3e50'; ctx.beginPath(); ctx.arc(rm.x, rm.y, 7 / st.view.s, 0, 7); ctx.fill();
      ctx.font = `bold ${13 / st.view.s}px system-ui`; ctx.lineWidth = 3 / st.view.s; ctx.strokeStyle = '#fff'; ctx.strokeText(rm.name, rm.x + 10 / st.view.s, rm.y + 4 / st.view.s); ctx.fillText(rm.name, rm.x + 10 / st.view.s, rm.y + 4 / st.view.s); });
    if (st.hl) { ctx.strokeStyle = '#ff00aa'; ctx.lineWidth = lw * 3; st.hl.forEach(d => ctx.strokeRect(d.x - 4, d.y - 4, d.w + 8, d.h + 8)); }
    if (drag && drag.rect) { ctx.strokeStyle = '#e67e22'; ctx.lineWidth = lw; ctx.strokeRect(drag.rect.x, drag.rect.y, drag.rect.w, drag.rect.h); }
    ctx.restore();
  }
  function setTool(t) { st.tool = t; el.querySelectorAll('[data-tool]').forEach(b => b.className = 'b sm' + (b.dataset.tool === t ? '' : ' ghost')); cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair'; }
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  let drag = null;
  cv.addEventListener('wheel', e => { if (!st.cv) return; e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    st.view.x = mx - (mx - st.view.x) * k; st.view.y = my - (my - st.view.y) * k; st.view.s *= k; draw(); }, { passive: false });
  cv.addEventListener('pointerdown', e => { if (!st.cv) return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, [x, y] = toImg(mx, my); cv.setPointerCapture(e.pointerId);
    drag = { mx, my, x, y, vx: st.view.x, vy: st.view.y, moved: false }; });
  cv.addEventListener('pointermove', e => { if (!drag) return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; if (Math.hypot(mx - drag.mx, my - drag.my) > 3) drag.moved = true;
    if (st.tool === 'pan' || e.buttons === 4) { st.view.x = drag.vx + mx - drag.mx; st.view.y = drag.vy + my - drag.my; draw(); return; }
    if (st.tool === 'sample' || st.tool === 'region') { const [x, y] = toImg(mx, my); drag.rect = { x: Math.min(x, drag.x), y: Math.min(y, drag.y), w: Math.abs(x - drag.x), h: Math.abs(y - drag.y) }; draw(); } });
  cv.addEventListener('pointerup', e => {
    if (!drag) return; const d = drag; drag = null; const { x, y } = d;
    if (st.tool === 'sample' && d.rect && d.rect.w > 4 && d.rect.h > 4) {
      const bb = SYM.cropIcon(st.ink, { x0: d.rect.x, x1: d.rect.x + d.rect.w, y0: d.rect.y, y1: d.rect.y + d.rect.h }) || { x: Math.round(d.rect.x), y: Math.round(d.rect.y), w: Math.round(d.rect.w), h: Math.round(d.rect.h) };
      addSample(st.mode === 'eui' ? 'Розетка' : 'Светильник', bb, null); st.selSample = st.samples.length - 1; drawSamples(); setTool('pan');
      setMsg('Образец добавлен. Подпишите его и выберите изделие справа, затем «Найти значки».');
    } else if (st.tool === 'region' && d.rect && d.rect.w > 20) { st.region = { x0: d.rect.x, y0: d.rect.y, x1: d.rect.x + d.rect.w, y1: d.rect.y + d.rect.h }; setTool('pan'); }
    else if (!d.moved && st.tool === 'add' && st.samples[st.selSample]) { const s = st.samples[st.selSample]; st.dets.push({ x: x - s.w / 2, y: y - s.h / 2, w: s.w, h: s.h, ti: st.selSample, c: 1, manual: true }); assignRooms(); drawSamples(); drawGroups(); results(); }
    else if (!d.moved && st.tool === 'del') { const i = st.dets.findIndex(o => x >= o.x - 3 && x <= o.x + o.w + 3 && y >= o.y - 3 && y <= o.y + o.h + 3); if (i >= 0) { st.dets.splice(i, 1); drawSamples(); drawGroups(); results(); } }
    else if (!d.moved && st.tool === 'room' && st.rooms[st.selRoom]) { Object.assign(st.rooms[st.selRoom], { x, y }); rebuildZones(); drawRooms(); results(); }
    draw();
  });
  new ResizeObserver(() => draw()).observe(cv);
  /* ---------- результат ---------- */
  function frameClusters() { const L = st.dets.filter(d => !d.off && st.samples[d.ti] && st.samples[d.ti].on && (st.mode !== 'eui' || st.samples[d.ti].vid)); return SYM.frames(L).map(cl => cl.map(i => st.dets.indexOf(L[i]))); }
  const roomName = i => (i >= 0 && st.rooms[i] ? st.rooms[i].name : 'Весь объект');
  function counts() {
    const c = {}; // room → ti → n
    for (const d of st.dets) { const s = st.samples[d.ti]; if (!s || !s.on || d.off) continue; const r = roomName(d.room); (c[r] = c[r] || {})[d.ti] = (c[r][d.ti] || 0) + 1; }
    return c;
  }
  /** Рамки: группы значков вплотную; подпись «Р-0N» рядом с группой задаёт число постов (и помещение группы). */
  function frameCounts() {
    const f = {}, add = (r, n) => { f[r] = f[r] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; while (n > 0) { const k = Math.min(5, n); f[r][k]++; n -= k; } };
    const cls = frameClusters().map(cl => { const ds = cl.map(i => st.dets[i]), x0 = Math.min(...ds.map(d => d.x)), y0 = Math.min(...ds.map(d => d.y)), x1 = Math.max(...ds.map(d => d.x + d.w)), y1 = Math.max(...ds.map(d => d.y + d.h));
      const rv = {}; ds.forEach(d => { const r = roomName(d.room); rv[r] = (rv[r] || 0) + 1; }); return { n: ds.length, x0, y0, x1, y1, room: Object.entries(rv).sort((a, b) => b[1] - a[1])[0][0], lbl: null, sz: Math.max(...ds.map(d => Math.max(d.w, d.h))) }; });
    st.frameDiag = [];
    if (st.frameLbl && st.frameLbl.length) {
      // каждой подписи — ближайшая группа значков (подписи стоят рядом с рамкой)
      const pairs = []; st.frameLbl.forEach((L, li) => cls.forEach((c, ci) => { const dx = Math.max(c.x0 - L.x, 0, L.x - c.x1), dy = Math.max(c.y0 - L.y, 0, L.y - c.y1), dd = Math.hypot(dx, dy); if (dd < c.sz * 4) pairs.push([dd, li, ci]); }));
      pairs.sort((a, b) => a[0] - b[0]); const usedL = new Set();
      for (const [, li, ci] of pairs) { if (usedL.has(li) || cls[ci].lbl) continue; cls[ci].lbl = st.frameLbl[li]; usedL.add(li); }
      // рамка на N постов, а рядом найдено меньше значков: добавить ближайшие соседние группы в линию
      cls.forEach(c => { if (!c.lbl) return; for (let guard = 0; guard < 5 && c.n < c.lbl.n; guard++) {
        let bi = -1, bd = 1e9; cls.forEach((o, oi) => { if (o === c || o.lbl || o.absorbed) return; const gx = Math.max(o.x0 - c.x1, c.x0 - o.x1, 0), gy = Math.max(o.y0 - c.y1, c.y0 - o.y1, 0), alignH = gy === 0 && Math.abs((o.y0 + o.y1) - (c.y0 + c.y1)) < c.sz, alignV = gx === 0 && Math.abs((o.x0 + o.x1) - (c.x0 + c.x1)) < c.sz, dd = Math.max(gx, gy);
          if ((alignH || alignV) && dd < c.sz * 1.2 && o.n + c.n <= c.lbl.n && dd < bd) { bd = dd; bi = oi; } });
        if (bi < 0) break; const o = cls[bi]; o.absorbed = true; c.n += o.n; c.x0 = Math.min(c.x0, o.x0); c.y0 = Math.min(c.y0, o.y0); c.x1 = Math.max(c.x1, o.x1); c.y1 = Math.max(c.y1, o.y1); } });
      st.frameLbl.forEach((L, li) => { if (!usedL.has(li)) { const z = st.zones ? st.zones.at(L.x, L.y) : -1; add(roomName(z >= 0 ? st.zones.map[z] : -1), L.n); st.frameDiag.push(`подпись Р-0${L.n} без найденных значков рядом`); } });
    }
    cls.filter(c => !c.absorbed).forEach(c => { const n = c.lbl ? c.lbl.n : c.n; if (c.lbl && c.lbl.n !== c.n) st.frameDiag.push(`${c.room}: рамка Р-0${c.lbl.n}, найдено значков ${c.n}`); add(c.room, n); });
    return f;
  }
  const finalN = (room, ti, auto) => { const m = st.manual[room + '|' + ti]; return m === '' || m == null ? auto : +m; };
  function results() {
    if (!st.dets.length && !Object.keys(st.manual).length) { $('#dOut').innerHTML = ''; return; }
    const c = counts(), fr = st.mode === 'eui' ? frameCounts() : {}, rooms = [...new Set([...st.rooms.map(r => r.name), ...Object.keys(c)])].filter(r => c[r] || Object.keys(st.manual).some(k => k.startsWith(r + '|')));
    const act = st.samples.map((s, i) => ({ s, i })).filter(o => o.s.on);
    let h = `<div class="card"><h3>3. Количество по помещениям</h3><p class="mute" style="margin-top:0">Серое — найдено по значкам (авто). Впишите своё число, если распознано неверно; пустое поле — авто.</p><div class="scroll"><table class="t"><tr><th>Помещение</th>${act.map(o => `<th style="font-size:12px;max-width:110px"><span style="color:${o.s.color}">■</span> ${esc(o.s.label.slice(0, 40))}</th>`).join('')}${st.mode === 'eui' ? '<th style="font-size:12px">Рамки 1 / 2 / 3 / 4 / 5 постов</th>' : ''}</tr>`;
    const tot = {};
    for (const r of rooms) {
      h += `<tr><td>${esc(r)}</td>` + act.map(o => { const a = (c[r] || {})[o.i] || 0, m = st.manual[r + '|' + o.i]; tot[o.i] = (tot[o.i] || 0) + finalN(r, o.i, a);
        return `<td><input data-man="${esc(r)}|${o.i}" value="${m == null ? '' : m}" placeholder="${a}" style="width:46px"></td>`; }).join('');
      if (st.mode === 'eui') { const f = (st.frameMan[r]) || fr[r] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; h += `<td style="white-space:nowrap">${[1, 2, 3, 4, 5].map(k => `<input data-fm="${esc(r)}|${k}" value="${st.frameMan[r] ? f[k] : ''}" placeholder="${(fr[r] || {})[k] || 0}" style="width:34px">`).join('')}</td>`; }
      h += '</tr>';
    }
    h += `<tr><td><b>Итого</b></td>${act.map(o => `<td><b>${tot[o.i] || 0}</b>${o.s.qty != null ? `<span class="mute"> / ${o.s.qty}</span>` : ''}</td>`).join('')}${st.mode === 'eui' ? '<td></td>' : ''}</tr></table></div>`;
    h += st.mode === 'eui'
      ? `<p class="mute">${st.frameLbl && st.frameLbl.length ? `Рамки — группы значков вплотную; число постов — по подписи «Р-0N» рядом (подписей на плане: ${st.frameLbl.length}).${st.frameDiag && st.frameDiag.length ? ' Проверьте: ' + esc(st.frameDiag.slice(0, 8).join('; ')) + (st.frameDiag.length > 8 ? '…' : '') : ''}` : 'Рамки: значки, стоящие вплотную, считаются одной рамкой (число значков = число постов). Проверьте на плане — рамки обведены и подписаны «N п.».'}</p><div class="row"><button class="b" id="dToV">Передать в «ЭУИ Voltum»</button></div>`
      : `<div class="row"><button class="b" id="dToP">Сделать рабочим вариантом</button><button class="b ghost" id="dToPadd">Добавить к рабочему варианту</button><span class="mute">Площади помещений — из экспликации; по ним считается освещённость.</span></div>`;
    $('#dOut').innerHTML = h + '</div>';
    $('#dOut').querySelectorAll('[data-man]').forEach(x => x.onchange = () => { const v = x.value.trim(); if (v === '') delete st.manual[x.dataset.man]; else st.manual[x.dataset.man] = Math.max(0, +v || 0); results(); });
    $('#dOut').querySelectorAll('[data-fm]').forEach(x => x.onchange = () => { const [r, k] = x.dataset.fm.split('|'); const base = st.frameMan[r] || Object.assign({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, fr[r] || {}); base[k] = Math.max(0, +x.value || 0); st.frameMan[r] = base; results(); });
    const toV = $('#dToV'); if (toV) toV.onclick = () => {
      const list = [];
      for (const r of rooms) act.forEach(o => { const n = finalN(r, o.i, (c[r] || {})[o.i] || 0); if (n > 0) list.push({ room: r, type: o.s.label, qty: n, id: o.s.vid || '' }); });
      const frames = {}; for (const r of rooms) frames[r] = st.frameMan[r] || fr[r] || null;
      VOLTUM.setRows(list, frames); showTab('eui'); MTUI.toast && MTUI.toast('Передано в «ЭУИ Voltum»: выберите серию и цвет и нажмите «Подобрать»');
    };
    const toP = add => {
      const rr = [], rws = [];
      for (const r of rooms) { const R = st.rooms.find(x => x.name === r); rr.push({ name: r, S: R && R.S ? R.S : '', H: 2.75 });
        act.forEach(o => { const n = finalN(r, o.i, (c[r] || {})[o.i] || 0), x = MT.get(o.s.a); if (!(n > 0) || !x) return; const k = MT.kind(x);
          rws.push({ room: r, a: x.a, qty: n, note: 'по чертежу: ' + o.s.label, group: ['встраиваемый', 'накладной', 'потолочный', 'трековый'].includes(k) ? 'Общий свет' : k === 'настенный' ? 'Бра' : 'Декоративный свет' });
          const cap = MT.features(x).cap; if (cap && /GU10|GX53/.test(cap)) { const src = (MT.sourceList(cap) || []).find(s => !s.dim && !s.module && s.ang <= 60) || (MT.sourceList(cap) || [])[0]; if (src) rws.push({ room: r, a: src.a, qty: n * (x.nl || 1), note: 'лампа', group: 'Общий свет' }); } }); }
      const miss = act.filter(o => !MT.get(o.s.a)).map(o => o.s.label); if (miss.length) setMsg('Не выбрана модель для: ' + miss.join('; ') + ' — они не попали в проект.');
      if (add && PROJECT.data) { const d = PROJECT.data; rr.forEach(r => { if (!d.rooms.some(x => x.name === r.name)) d.rooms.push(r); }); d.rows = d.rows.filter(x => !(String(x.note || '').startsWith('по чертежу') && rr.some(r => r.name === x.room))).concat(rws); PROJECT.sync(); }
      else PROJECT.set(rr, rws, 'по чертежу');
      MTUI.toast && MTUI.toast('Проект и КП обновлены по чертежу');
    };
    const p1 = $('#dToP'), p2 = $('#dToPadd'); if (p1) p1.onclick = () => toP(false); if (p2) p2.onclick = () => toP(true);
  }
  window.addEventListener('tab-shown', e => { if (e.detail === 'drw') { if (st.cv && !st.view.s) fit(); draw(); } });
  window.DRAWING = { st, results, autoRooms, frameInfo: () => frameCounts(), counts: () => counts() };
})();
