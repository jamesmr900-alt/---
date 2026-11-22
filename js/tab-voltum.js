/* Вкладка «ЭУИ Voltum»: подбор розеток, выключателей, механизмов, накладок и рамок Voltum по помещениям.
   Источник количеств — страница дизайн-проекта (экспликация механизмов / план розеток, PDF) или ввод вручную.
   Каталог: data/voltum.json (каталог Voltum 2026 + артикулы с voltum.ru). */
(function () {
  'use strict';
  const { $, esc } = MTUI;
  const el = document.querySelector('section[data-p="eui"]'); if (!el) return;
  let V = null, rows = [], out = [];
  // тип из проекта → изделие Voltum
  function mapType(t) {
    const s = t.toLowerCase().replace(/ё/g, 'е'), two = /2[\s-]*кл|двух/.test(s), three = /3[\s-]*кл|трех/.test(s), led = /подсвет|индикац/.test(s);
    if (/380|трехфаз/.test(s)) return { id: null, why: 'розетки 380 В в серии нет — подберите силовую розетку отдельно' };
    if (/мастер/.test(s)) return { id: 'push1', why: 'мастер-выключатель: кнопка с самовозвратом для импульсного реле' };
    if (/диммер|светорегул/.test(s)) return { id: 'dim', why: 'поворотно-нажимной светорегулятор 600 Вт (для ламп накаливания, галогенных и диммируемых LED)' };
    if (/жалюзи|штор/.test(s) && /выключ|переключ/.test(s)) return { id: 'blind' };
    if (/карточ/.test(s)) return { id: 'card' };
    if (/перекрест/.test(s)) return { id: two ? 'cross2' : 'cross1' };
    if (/проходн/.test(s)) return { id: (two ? 'pass2' : 'pass1') + (led ? '_led' : '') };
    if (/кнопк|самовозв|звон/.test(s)) return { id: two ? 'push2' : 'push1' };
    if (/выключ/.test(s)) return { id: three ? 'sw3' : (two ? 'sw2' : 'sw1') + (led ? '_led' : '') };
    if (/hdmi/.test(s)) return { id: 'hdmi' };
    if (/акуст/.test(s)) return { id: 'audio' };
    if (/(tv|тв|телевиз)/.test(s) && /rj|интернет|компьют/.test(s)) return { id: 'tv_rj' };
    if (/tv|тв\b|телевиз|sat/.test(s)) return { id: 'tv' };
    if (/rj|интернет|компьют|лвс|сетев/.test(s)) return { id: /двойн|2\s*x|x\s*2|rj45\s*\+\s*rj45/.test(s) ? 'rj45x2' : 'rj45' };
    if (/usb/.test(s)) return { id: /type[\s-]*c|\+\s*c|a\s*\+\s*c/.test(s) ? 'sock_usb_ac' : 'sock_usb_ac', why: /a\s*\+\s*a/.test(s) ? '' : 'USB A+C (есть и A+A — VLS0404)' };
    if (/ip\s*4[4-9]|влаго|крышк/.test(s)) return { id: 'sock_lid', why: 'розетка с крышкой IP40; если по проекту нужна IP44 — добавьте кожух VLS0806 или подберите влагозащищённую розетку' };
    if (/розетк/.test(s)) return { id: 'sock_sh' };
    if (/терморег/.test(s)) return { id: 'thermo' };
    if (/датчик.*движ|движ.*датчик/.test(s)) return { id: 'pir' };
    if (/подсветк|ночник/.test(s)) return { id: /датчик/.test(s) ? 'nightpir' : 'nightled' };
    if (/заглушк/.test(s)) return { id: 'blank' };
    if (/вывод.*кабел/.test(s)) return { id: 'cable' };
    return { id: null, why: 'не распознано — выберите изделие вручную' };
  }
  const TYPE_RX = /(Выключател|Переключател|Мастер|Розетк|Терморегул|Датчик|Вывод для кабел|Кнопк|Звонок|Диммер|Светорегул|USB|HDMI|ТВ|TV|Интернет|RJ|Телефон|Компьют|Телевиз|Заглушк|Подсветк)/i;
  /** Разбор текста: строки «тип … количество»; строка-заголовок без количества (или «Кухня:») — помещение. */
  function parseText(text) {
    const res = []; let room = 'Весь объект';
    for (let line of text.split(/\n/)) {
      line = line.replace(/\s+$/, ''); if (!line.trim()) continue;
      const rm = line.match(/^\s*([А-ЯЁA-Z][А-Яа-яёЁ\-\s\d№.]{2,40}):\s*(.*)$/);
      let rest = line;
      if (rm && !TYPE_RX.test(rm[1])) { room = rm[1].trim(); rest = rm[2]; if (!rest) continue; }
      // несколько позиций в строке через «;»
      for (const part of rest.split(/;/)) {
        const re = new RegExp('(' + TYPE_RX.source + '(?:(?!\\s{2,}).)*?)[\\s—–:-]+(\\d{1,4})\\s*(?:шт\\.?)?\\s*$', 'i');
        const m = part.match(re); if (!m) continue;
        const t = m[1].replace(/\s+/g, ' ').trim(), q = +m[m.length - 1];
        if (q > 0 && q < 2000) res.push({ room, type: t, qty: q });
      }
    }
    // одинаковые строки (повтор экспликации на соседних листах) не складываем
    const seen = new Map(); for (const r of res) { const k = r.room + '|' + r.type.toLowerCase(); if (!seen.has(k)) seen.set(k, r); }
    return [...seen.values()];
  }
  el.innerHTML = `
  <div class="card"><h3>1. Откуда взять розетки и выключатели</h3>
    <div class="row">
      <label class="b ghost" style="cursor:pointer">PDF дизайн-проекта…<input type="file" id="vPdf" accept=".pdf" hidden></label>
      <label>Страница <input id="vPage" type="number" min="1" style="width:70px" placeholder="авто"></label>
      <button class="b ghost" id="vRead">Прочитать страницу</button>
      <span class="mute" id="vPdfMsg">Ищется лист «Экспликация механизмов» / «План розеток и выключателей». Читается текст страницы: тип механизма и количество.</span>
    </div>
    <label style="margin-top:8px">Или вставьте текст (по помещениям: «Кухня: Розетка 220V 6; Выключатель 1-кл. 2» — каждая строка или через «;»)
      <textarea id="vText" rows="5" placeholder="Кухня:&#10;Розетка 220V  6&#10;Выключатель 2-кл.  1&#10;Спальня: Розетка 220V 4; Выключатель проходной 1-кл. 2"></textarea></label>
    <div class="row" style="margin-top:6px"><button class="b" id="vParse">Разобрать текст</button><button class="b ghost" id="vAdd">+ строка</button><button class="b ghost" id="vRooms">Помещения из проекта</button><span class="mute" id="vMsg"></span></div>
  </div>
  <div class="card"><h3>2. Помещения и изделия</h3>
    <p class="mute" style="margin-top:0">В экспликации проекта обычно итог по этажу или дому — он попадает в «Весь объект». Чтобы получить КП по помещениям, поменяйте помещение в строке или разделите строку (кнопка ⇆).</p>
    <div class="scroll" style="max-height:none"><table class="t" id="vTab"></table></div>
  </div>
  <div class="card"><h3>3. Серия, цвет, рамки</h3>
    <div class="grid g4">
      <label>Серия<select id="vSer"><option value="S70">S70 (пластик)</option><option value="MET">S70 Metal (металлические накладки и рамки)</option><option value="M25">M25 (артикулы VLM, по сайту voltum.ru)</option></select></label>
      <label>Цвет изделий<select id="vCol"></select></label>
      <label>Рамки<select id="vFr"></select></label>
      <label>Цвет рамок<select id="vFrCol"></select></label>
      <label>Комплектация<select id="vAsm"><option value="asm">собранные изделия (механизм + накладка), где есть</option><option value="sep">механизм и накладка отдельно</option></select></label>
      <label>Рамки на несколько постов<select id="vBlk"><option value="0">каждое изделие в своей рамке</option><option value="2">группировать по 2 поста</option><option value="3">по 3 поста</option><option value="4">по 4 поста</option></select></label>
      <label style="flex-direction:row;align-items:center;gap:6px;color:var(--ink)"><input type="checkbox" id="vLed" style="width:auto">выключатели с подсветкой</label>
    </div>
    <div class="row" style="margin-top:10px"><button class="b" id="vGo">Подобрать</button></div>
  </div>
  <div id="vOut"></div>`;
  const COLN = c => (V && V.colors[c]) || c;
  function fillSelects() {
    const ser = $('#vSer').value, cols = ser === 'MET' ? V.MET : ser === 'M25' ? ['02', '03', '08'] : V.S70;
    const keep = $('#vCol').value; $('#vCol').innerHTML = cols.map(c => `<option value="${c}">${c} · ${esc(COLN(c))}</option>`).join(''); if (cols.includes(keep)) $('#vCol').value = keep;
    const fr = ser === 'MET' ? ['metal', 'plastic', 'glass'] : ser === 'M25' ? ['m25'] : ['plastic', 'glass', 'metal'];
    const kf = $('#vFr').value; $('#vFr').innerHTML = fr.map(k => `<option value="${k}">${esc(V.frames[k].n)}</option>`).join(''); if (fr.includes(kf)) $('#vFr').value = kf;
    fillFrameCol();
  }
  function fillFrameCol() {
    const f = V.frames[$('#vFr').value], cols = f.avail['1'], c = $('#vCol').value;
    $('#vFrCol').innerHTML = cols.map(x => `<option value="${x}">${x} · ${esc(COLN(x))}</option>`).join(''); if (cols.includes(c)) $('#vFrCol').value = c;
  }
  function drawRows() {
    if (!rows.length) { $('#vTab').innerHTML = '<tr><td class="mute">Загрузите страницу проекта или вставьте текст.</td></tr>'; return; }
    const opts = V.items.map(it => `<option value="${it.id}">${esc(it.n)}</option>`).join('');
    let h = '<tr><th>Помещение</th><th>По проекту</th><th>Изделие Voltum</th><th class="num">Кол-во</th><th></th></tr>';
    rows.forEach((r, i) => {
      h += `<tr><td><input data-i="${i}" data-f="room" value="${esc(r.room)}" list="vRoomList" style="width:150px"></td><td>${esc(r.type)}${r.why ? `<div class="mute" style="font-size:12px">${esc(r.why)}</div>` : ''}</td>
        <td><select data-i="${i}" data-f="id"><option value="">— не подбирать —</option>${opts}</select></td>
        <td class="num"><input type="number" min="0" data-i="${i}" data-f="qty" value="${r.qty}" style="width:64px"></td>
        <td><button class="b ghost sm" data-split="${i}" title="Разделить строку на два помещения">⇆</button><button class="b ghost sm" data-del="${i}">✕</button></td></tr>`;
    });
    const rl = [...new Set([...rows.map(r => r.room), ...(window.PROJECT && PROJECT.data ? PROJECT.data.rooms.map(r => r.name) : [])])];
    $('#vTab').innerHTML = h + `<datalist id="vRoomList">${rl.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`;
    $('#vTab').querySelectorAll('select[data-f="id"]').forEach(s => { s.value = rows[+s.dataset.i].id || ''; });
    $('#vTab').querySelectorAll('[data-f]').forEach(inp => inp.onchange = () => { const r = rows[+inp.dataset.i], f = inp.dataset.f; r[f] = f === 'qty' ? +inp.value || 0 : inp.value; if (f === 'id') r.why = ''; });
    $('#vTab').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { rows.splice(+b.dataset.del, 1); drawRows(); });
    $('#vTab').querySelectorAll('[data-split]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.split], h2 = Math.floor(r.qty / 2); if (r.qty < 2) return; r.qty -= h2; rows.splice(+b.dataset.split + 1, 0, Object.assign({}, r, { qty: h2, room: 'Помещение' })); drawRows(); });
  }
  function setRows(list) { rows = list.map(r => { const m = mapType(r.type); return { room: r.room, type: r.type, qty: r.qty, id: m.id || '', why: m.why || '' }; }); drawRows(); }
  // PDF
  let pdfFile = null;
  $('#vPdf').onchange = e => { pdfFile = e.target.files[0]; $('#vPdfMsg').textContent = pdfFile ? `${pdfFile.name} — нажмите «Прочитать страницу» (или укажите номер листа).` : ''; if (pdfFile) $('#vRead').click(); };
  $('#vRead').onclick = async () => {
    if (!pdfFile) { $('#vPdfMsg').textContent = 'Сначала выберите PDF.'; return; }
    $('#vPdfMsg').textContent = 'Читаю PDF…';
    try {
      const lib = await MTUI.loadPdfJs(), doc = await lib.getDocument({ data: await pdfFile.arrayBuffer() }).promise;
      // координаты с учётом поворота листа (A3 часто повёрнут): переводим в экранные
      const pageText = async n => { const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent(), lines = new Map();
        tc.items.forEach(it => { if (!it.str || !it.str.trim()) return; const t = lib.Util.transform(vp.transform, it.transform), y = Math.round(t[5] / 3); if (!lines.has(y)) lines.set(y, []); lines.get(y).push({ s: it.str, x: t[4], w: it.width || 0 }); });
        return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, its]) => { its.sort((a, b) => a.x - b.x); let s = '', x = -1e9; for (const it of its) { s += (it.x - x > 8 ? '   ' : '') + it.s; x = it.x + it.w; } return s; }).join('\n'); };
      const parsePage = txt => { const list = [], re = new RegExp('(' + TYPE_RX.source + '(?:(?!\\s{2,}).)*)\\s{2,}(\\d{1,4})(?=\\s{2,}|\\s*$)', 'gi'); for (const line of txt.split('\n')) for (const m of line.matchAll(re)) list.push({ room: 'Весь объект', type: m[1].trim(), qty: +m[m.length - 1] });
        const u = []; list.forEach(r => { if (!u.some(x => x.type === r.type)) u.push(r); }); return u; };
      let n = +$('#vPage').value, txt = '', uniq = [];
      if (n > 0) { txt = await pageText(n); uniq = parsePage(txt); }
      else for (let i = 1; i <= doc.numPages; i++) {
        $('#vPdfMsg').textContent = `Ищу экспликацию механизмов: лист ${i} из ${doc.numPages}…`;
        const t = await pageText(i); if (!/экспликац[а-я]*\s+механизм|розет[а-я]*,?\s+выключат/i.test(t)) continue;
        const u = parsePage(t); if (u.length >= 3) { n = i; txt = t; uniq = u; break; } if (!txt) { n = i; txt = t; }
      }
      if (!txt) { $('#vPdfMsg').textContent = 'Лист с экспликацией механизмов не найден — укажите номер страницы.'; return; }
      if (!uniq.length) { $('#vPdfMsg').textContent = `Стр. ${n}: таблица «тип — количество» не распознана. Скопируйте текст в поле ниже.`; $('#vText').value = txt.slice(0, 4000); return; }
      $('#vPage').value = n; $('#vPdfMsg').textContent = `Стр. ${n}: найдено типов — ${uniq.length}, всего ${uniq.reduce((t, r) => t + r.qty, 0)} шт. Распределите по помещениям в таблице ниже.`;
      setRows(uniq);
    } catch (e) { $('#vPdfMsg').textContent = 'Не удалось прочитать PDF: ' + e.message; }
  };
  $('#vParse').onclick = () => { const l = parseText($('#vText').value); $('#vMsg').textContent = l.length ? `Распознано строк: ${l.length}` : 'Не распознано: нужны строки вида «Розетка 220V 6»'; if (l.length) setRows(rows.concat(l).map(r => r.id !== undefined ? r : r)); };
  $('#vAdd').onclick = () => { rows.push({ room: 'Помещение', type: '—', qty: 1, id: 'sock_sh', why: '' }); drawRows(); };
  $('#vRooms').onclick = () => { if (!(window.PROJECT && PROJECT.data)) { $('#vMsg').textContent = 'Рабочего варианта ещё нет — сделайте его в «Подборе с нуля».'; return; } $('#vMsg').textContent = 'Помещения проекта доступны в списке «Помещение» каждой строки.'; drawRows(); };
  // подбор
  function build() {
    const ser = $('#vSer').value, col = $('#vCol').value, frK = $('#vFr').value, frCol = $('#vFrCol').value, asm = $('#vAsm').value === 'asm', blk = +$('#vBlk').value, ledOn = $('#vLed').checked;
    const byId = Object.fromEntries(V.items.map(i => [i.id, i])), res = [], warn = [], rooms = new Map();
    const add = (room, a, n, qty, note) => { const k = room + '|' + a, ex = res.find(r => r.k === k); if (ex) ex.qty += qty; else res.push({ k, room, a, n, qty, note }); };
    for (const r of rows) {
      if (!r.id || !(r.qty > 0)) { if (r.qty > 0) warn.push(`${r.room}: «${r.type}» — ${r.why || 'изделие не выбрано'}`); continue; }
      let it = byId[r.id]; if (ledOn && byId[r.id + '_led']) it = byId[r.id + '_led'];
      rooms.set(r.room, (rooms.get(r.room) || 0) + r.qty);
      if (ser === 'M25') {
        if (it.m25 && it.cM25.includes(col)) add(r.room, it.m25 + col, `${it.n}, M25, ${COLN(col)}`, r.qty, 'в сборе');
        else { warn.push(`${r.room}: «${it.n}» в серии M25 нет — взято из S70`); add(r.room, (it.cA.includes(col) ? it.asm : it.asm) + (it.cS.includes(col) ? col : it.cS[0]), `${it.n}, S70`, r.qty, 'замена серии'); }
        continue;
      }
      const cov = ser === 'MET' ? it.covM : it.cov, colsAvail = ser === 'MET' ? it.cM : it.cS;
      if (ser === 'MET' && !cov) { warn.push(`${r.room}: «${it.n}» — металлической накладки нет, взята накладка S70 цвета ${COLN('08')}`); }
      if (!it.mech) { const c = it.cS.includes(col) ? col : (it.cS.includes(frCol) ? frCol : it.cS[0]); add(r.room, it.asm + c, `${it.n}, ${COLN(c)}`, r.qty, 'в сборе'); continue; }
      const useCov = cov || it.cov, c = (ser === 'MET' && cov ? colsAvail : it.cS).includes(col) ? col : (ser === 'MET' && !cov ? '08' : it.cS[0]);
      if (c !== col) warn.push(`${r.room}: «${it.n}» в цвете «${COLN(col)}» нет — взят «${COLN(c)}»`);
      if (asm && ser === 'S70' && it.cA.includes(c)) add(r.room, it.asm + c, `${it.n} (механизм + накладка), ${COLN(c)}`, r.qty, 'в сборе');
      else { add(r.room, it.mech, `Механизм: ${it.n}`, r.qty, 'механизм'); add(r.room, useCov + c, `Накладка/клавиша: ${it.n}, ${COLN(c)}`, r.qty, 'накладка'); if (it.led && !(asm && ser === 'S70' && it.cA.includes(c))) add(r.room, it.led, `Модуль подсветки (${it.n})`, r.qty, 'подсветка'); }
    }
    // рамки
    const F = V.frames[frK];
    for (const [room, posts] of rooms) {
      let left = posts;
      if (blk >= 2) { const nb = Math.floor(posts / blk); if (nb && F.avail[blk].includes(frCol)) { add(room, F.base + blk + frCol, `${F.n} на ${blk} поста, ${COLN(frCol)}`, nb, `${blk}-постовые блоки`); left -= nb * blk; } }
      if (left > 0 && F.avail['1'].includes(frCol)) add(room, F.base + '1' + frCol, `${F.n} на 1 пост, ${COLN(frCol)}`, left, 'одиночные');
    }
    if (rooms.size) warn.push('Группировка рамок условная: на сколько постов каждая рамка — по развёрткам стен проекта; поправьте количество 1/2/3-постовых рамок в КП.');
    return { res, warn, rooms };
  }
  $('#vGo').onclick = () => {
    const { res, warn } = build(); out = res;
    if (!res.length) { $('#vOut').innerHTML = `<div class="card">${MTUI.warnHTML(warn.length ? warn : ['Нет строк для подбора.'])}</div>`; return; }
    let room = null, h = '<div class="card"><h3>Спецификация Voltum по помещениям</h3><div class="scroll"><table class="t"><tr><th>Помещение</th><th>Артикул</th><th>Наименование</th><th class="num">Кол-во</th><th>Примечание</th></tr>';
    res.sort((a, b) => a.room.localeCompare(b.room, 'ru')).forEach(r => { h += `<tr><td>${r.room !== room ? esc(room = r.room) : ''}</td><td>${esc(r.a)}</td><td>${esc(r.n)}</td><td class="num">${r.qty}</td><td class="mute">${esc(r.note)}</td></tr>`; });
    const total = res.reduce((t, r) => t + r.qty, 0);
    h += `</table></div><p class="mute">Позиций: ${res.length}, изделий: ${total}. Цены Voltum в прайс-листе комплектатора нет — уточняйте РРЦ у Voltum.</p>${warn.length ? MTUI.warnHTML(warn) : ''}
      <div class="row"><button class="b" id="vToKp">Добавить в КП</button><button class="b ghost" id="vXlsx">Excel</button></div></div>`;
    $('#vOut').innerHTML = h;
    $('#vToKp').onclick = () => {
      const kr = res.map(r => ({ room: r.room, a: r.a, qty: r.qty, group: 'ЭУИ Voltum', note: r.note }));
      if (window.PROJECT && PROJECT.data) { const d = PROJECT.data; d.rows = d.rows.filter(x => x.group !== 'ЭУИ Voltum').concat(kr); PROJECT.sync(); }
      else MTUI.kp.add(kr);
      $('#vToKp').textContent = `В КП: ${kr.length} поз.`; if (MTUI.toast) MTUI.toast('ЭУИ Voltum добавлены в КП');
    };
    $('#vXlsx').onclick = async () => { const aoa = [['Помещение', 'Артикул', 'Наименование', 'Кол-во', 'Примечание'], ...res.map(r => [r.room, r.a, r.n, r.qty, r.note])];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Voltum'); const fn = 'ЭУИ Voltum.xlsx';
      if (await MTUI.saveFile(fn, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]))) return; XLSX.writeFile(wb, fn); };
  };
  fetch('data/voltum.json?v=' + (window.ASSET_V || '')).then(r => r.json()).then(d => {
    V = d; fillSelects(); drawRows();
    $('#vSer').onchange = fillSelects; $('#vFr').onchange = fillFrameCol; $('#vCol').onchange = fillFrameCol;
    // названия всех артикулов Voltum — чтобы КП, сохранённое ранее, показывало их
    const L = [], C = c => COLN(c);
    for (const it of V.items) {
      it.cS.forEach(c => { L.push({ a: it.asm + c, n: `Voltum S70 · ${it.n}, ${C(c)}` }); if (it.cov) L.push({ a: it.cov + c, n: `Voltum S70 · накладка/клавиша: ${it.n}, ${C(c)}` }); });
      (it.cM || []).forEach(c => L.push({ a: it.covM + c, n: `Voltum S70 Metal · накладка: ${it.n}, ${C(c)}` }));
      (it.cM25 || []).forEach(c => L.push({ a: it.m25 + c, n: `Voltum M25 · ${it.n}, ${C(c)}` }));
      if (it.mech) L.push({ a: it.mech, n: `Voltum · механизм: ${it.n}` }); if (it.led) L.push({ a: it.led, n: `Voltum · модуль подсветки (${it.n})` });
    }
    for (const f of Object.values(V.frames)) for (const [g, cols] of Object.entries(f.avail)) cols.forEach(c => L.push({ a: f.base + g + c, n: `Voltum · ${f.n} на ${g} пост${g === '1' ? '' : g === '5' ? 'ов' : 'а'}, ${C(c)}` }));
    MT.addItems(L.map(x => Object.assign(x, { g: 'Voltum', c: 'ЭУИ', p: 0 })));
    const k = MTUI.kp.get(); if (k.rows.some(r => /^VL/.test(r.a))) MTUI.kp.set(k.rows, k.title);
  }).catch(e => { el.innerHTML = '<div class="card">Каталог Voltum не загрузился: ' + esc(e.message) + '</div>'; });
  window.VOLTUM = { parseText, mapType, get rows() { return rows; }, setRows, build: () => build() };
})();
