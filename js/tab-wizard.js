/* Вкладка «Подбор с нуля»: таблица помещений → три варианта комплектации (бюджет / средний / премиум). */
(function () {
  'use strict';
  const { $, esc, rub } = MTUI;
  const el = document.querySelector('section[data-p="wiz"]'); if (!el) return;
  el.innerHTML = `
  <div class="card">
    <h3>Помещения</h3>
    <div class="row" style="margin-bottom:8px">
      <button class="b ghost" id="wAdd">+ помещение</button>
      <label class="b ghost" style="display:inline-flex;flex-direction:row;cursor:pointer;color:var(--ink)">📎 Экспликация (PDF / Excel)<input type="file" id="wFile" accept=".pdf,.xlsx,.xls,.csv" hidden></label>
      <span class="mute" id="wMsg">Размеры — длина и ширина или площадь. Норма освещённости берётся по названию помещения.</span>
    </div>
    <div class="scroll" style="max-height:none"><table class="t" id="wTab"></table></div>
    <div class="grid g4" style="margin-top:12px">
      <label>Цветовая температура<select id="wCct"><option>2700</option><option selected>3000</option><option>4000</option></select></label>
      <label>Цвет подвесов и бра<select id="wAcc"><option value="">как корпус</option><option>латунь</option><option>золото</option><option>черный</option><option>белый</option></select></label>
      <label>Управление подсветкой<select id="wCtl"><option value="none">без управления</option><option>RF</option><option>Wi-Fi</option><option>Zigbee</option><option>DALI</option></select></label>
      <label>&nbsp;<button class="b" id="wGo">Подобрать 3 варианта</button></label>
    </div>
    <p class="mute" style="margin-top:8px">Правила: ГКЛ — встраиваемые, натяжной — встраиваемые на закладных, бетон — накладные; шаг ~1,5 м, количество — по норме СП 52; в утопленные — лампы 38–40° или модули до 60°; во влажные помещения — IP44+. Подвесы над столом — по одному на ~60 см.</p>
  </div>
  <div id="wOut"></div>`;
  const ROOM = () => ({ name: '', L: '', W: '', S: '', H: 2.75, ceiling: 'ГКЛ', color: 'белый', table: '', island: '', strip: '', bra: '' });
  let rooms = [Object.assign(ROOM(), { name: 'Гостиная', L: 5.2, W: 4.5, strip: 6 }), Object.assign(ROOM(), { name: 'Кухня-столовая', S: 16, table: 1.8 }), Object.assign(ROOM(), { name: 'Спальня', L: 4, W: 3.5, bra: 2 })];
  let res = null, cur = 'средний';
  const sel = (k, i, v, opts) => `<select data-r="${i}" data-k="${k}">${opts.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  function draw() {
    let h = '<tr><th>Помещение</th><th>Длина, м</th><th>Ширина, м</th><th>или S, м²</th><th>H, м</th><th>Потолок</th><th>Корпуса</th><th>Стол, м</th><th>Остров, м</th><th>Лента, м</th><th>Бра, шт</th><th></th></tr>';
    rooms.forEach((r, i) => { const inp = (k, w) => `<td><input data-r="${i}" data-k="${k}" value="${esc(r[k])}" style="width:${w}px"></td>`;
      h += `<tr>${inp('name', 150)}${inp('L', 56)}${inp('W', 56)}${inp('S', 56)}${inp('H', 50)}<td>${sel('ceiling', i, r.ceiling, ['ГКЛ', 'натяжной', 'бетон'])}</td><td>${sel('color', i, r.color, ['белый', 'черный', 'серый'])}</td>${inp('table', 50)}${inp('island', 50)}${inp('strip', 50)}${inp('bra', 44)}<td><button class="b ghost sm" data-del="${i}">✕</button></td></tr>`; });
    $('#wTab').innerHTML = h;
    $('#wTab').querySelectorAll('[data-r]').forEach(x => x.onchange = () => { rooms[+x.dataset.r][x.dataset.k] = x.value; });
    $('#wTab').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { rooms.splice(+b.dataset.del, 1); draw(); });
  }
  $('#wAdd').onclick = () => { rooms.push(ROOM()); draw(); };
  $('#wFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = ''; $('#wMsg').textContent = 'читаю…';
    try {
      let lines;
      if (/\.pdf$/i.test(f.name)) lines = await MTUI.pdfLines(f);
      else { const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); lines = wb.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).map(r => r.join(' '))); }
      const ex = KITS.explication(lines);
      if (!ex.length) { $('#wMsg').textContent = 'Экспликация не распознана: в файле не нашлось строк «номер — название — площадь». Заполните таблицу вручную.'; return; }
      rooms = ex.map(x => Object.assign(ROOM(), { name: `${x.num} ${x.name}`, S: x.area }));
      draw(); $('#wMsg').textContent = `Найдено помещений: ${ex.length}. Проверьте названия и площади, при необходимости уточните длину и ширину.`;
    } catch (er) { $('#wMsg').textContent = 'Не удалось прочитать файл: ' + er.message; }
  };
  const num = v => parseFloat(String(v).replace(',', '.')) || 0;
  $('#wGo').onclick = () => {
    const rr = rooms.filter(r => r.name).map(r => ({ name: r.name, L: num(r.L), W: num(r.W), S: num(r.S), H: num(r.H) || 2.75, ceiling: r.ceiling, color: r.color, table: num(r.table), island: num(r.island), strip: num(r.strip), bra: num(r.bra), accentColor: $('#wAcc').value || null }));
    if (!rr.length) { $('#wOut').innerHTML = '<div class="card mute">Добавьте помещения.</div>'; return; }
    res = KITS.wizard(rr, { cct: +$('#wCct').value, control: $('#wCtl').value });
    MTUI.TS.wizard = { rooms: rr, res };
    render();
  };
  function render() {
    const V = KITS.VARIANTS;
    let h = '<div class="card"><h3>Варианты</h3><div class="grid g3">' + V.map(t => `<div class="card" style="margin:0;cursor:pointer;${t === cur ? 'border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)' : ''}" data-v="${t}"><div class="mute">${t[0].toUpperCase() + t.slice(1)}</div><div class="big">${rub(res[t].total)}</div><div class="mute">${res[t].rows.length} позиций</div></div>`).join('') + '</div>';
    const v = res[cur];
    h += `<div class="row" style="margin:12px 0"><button class="b" id="wToKp">Вариант «${cur}» → в КП</button><button class="b ghost" id="wXlsx">Все три варианта в xlsx</button><span class="mute">Можно отредактировать в КП и проверить на вкладке «Проверка КП».</span></div>`;
    if (v.calcs.length) h += '<table class="t" style="margin-bottom:10px"><tr><th>Помещение</th><th>Общий свет</th><th class="num">Шт</th><th>Источник</th><th class="num">Норма</th><th class="num">Получится</th><th></th></tr>' +
      v.calcs.map(c => `<tr><td>${esc(c.room)}</td><td>${esc(c.fixture)}</td><td class="num">${c.n}</td><td>${esc(c.src)}</td><td class="num">${c.norm} лк</td><td class="num">${c.E >= c.norm * 0.98 ? '<span class="pill ok">' : '<span class="pill bad">'}${c.E} лк</span></td><td><button class="b ghost sm" data-plan="${esc(c.room)}">в план и 3D</button></td></tr>`).join('') + '</table>';
    h += MTUI.rowsHTML(v.rows, { room: true, group: true }) + MTUI.warnHTML(v.notes) + '</div>';
    $('#wOut').innerHTML = h;
    $('#wOut').querySelectorAll('[data-v]').forEach(d => d.onclick = () => { cur = d.dataset.v; render(); });
    $('#wToKp').onclick = () => { MTUI.kp.set(v.rows.map(r => ({ room: r.room, a: r.a, qty: r.qty })), `КП — ${cur} вариант`); $('#wToKp').textContent = 'Готово ✓ — открыта вкладка КП'; setTimeout(() => window.showTab && window.showTab('kp'), 400); };
    $('#wXlsx').onclick = async () => {
      const wb = XLSX.utils.book_new();
      V.forEach(t => { const w = MT.kpToXlsx(XLSX, res[t].rows.map(r => ({ room: r.room, a: r.a, qty: r.qty })), `Вариант «${t}»`); XLSX.utils.book_append_sheet(wb, w.Sheets['КП'], t); });
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      if (!(await MTUI.saveFile('Варианты подбора.xlsx', new Blob([buf])))) XLSX.writeFile(wb, 'Варианты подбора.xlsx');
    };
    $('#wOut').querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
      const room = MTUI.TS.wizard.rooms.find(r => r.name === b.dataset.plan);
      if (window.PLANNER) { window.PLANNER.fromWizard(room, v.rows.filter(r => r.room === room.name)); window.showTab && window.showTab('plan'); }
    });
  }
  window.WIZ = { setRooms(r) { rooms = (r || []).map(x => Object.assign(ROOM(), x)); draw(); } };
  draw();
})();
