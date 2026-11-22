/* Вкладка «Комплекты»: подсветка лентой, трековая система, DALI. */
(function () {
  'use strict';
  const { $, esc } = MTUI;
  const el = document.querySelector('section[data-p="kits"]'); if (!el) return;
  const opt = (arr, v) => arr.map(o => Array.isArray(o) ? `<option value="${o[0]}"${o[0] === v ? ' selected' : ''}>${o[1]}</option>` : `<option${o === v ? ' selected' : ''}>${o}</option>`).join('');
  el.innerHTML = `
  <div class="tabs" id="kTabs"><button data-k="lenta" class="on">Подсветка лентой</button><button data-k="track">Трековая система</button><button data-k="dali">DALI</button></div>
  <div data-kp="lenta" class="card">
    <div class="grid g4">
      <label>Помещение (для КП)<input id="lRoom" placeholder="Гостиная"></label>
      <label style="grid-column:span 3">Длины участков, м (через запятую — каждый участок питается отдельно)<input id="lSegs" value="4.2, 2.5"></label>
      <label>Напряжение<select id="lV">${opt([['24', '24 В'], ['12', '12 В'], ['48', '48 В'], ['230', '220 В']], '24')}</select></label>
      <label>Свечение<select id="lMode">${opt([['mono', 'одноцветная'], ['MIX', 'MIX (2700–6500K)'], ['RGB', 'RGB'], ['RGBW', 'RGBW']], 'mono')}</select></label>
      <label>Цветовая температура<select id="lCct">${opt(['2700', '3000', '4000', '6000'], '3000')}</select></label>
      <label>Мощность, Вт/м<select id="lW">${opt([['', 'любая'], ['4.8', '4,8'], ['9.6', '9,6'], ['14.4', '14,4'], ['19.2', '19,2']], '9.6')}</select></label>
      <label>Защита<select id="lIp">${opt([['20', 'IP20 — сухие помещения'], ['65', 'IP65 — влажные']], '20')}</select></label>
      <label>Профиль<select id="lProf">${opt([['none', 'без профиля'], 'накладной', 'угловой', 'встраиваемый', 'в пол', 'подвесной', 'натяжной', 'плинтус'], 'накладной')}</select></label>
      <label>Цвет профиля<select id="lPCol">${opt([['серебр', 'серебро'], ['черн', 'черный'], ['бел', 'белый']], 'серебр')}</select></label>
      <label>Управление<select id="lCtl">${opt([['none', 'без управления'], ['RF', 'радиопульт'], 'Wi-Fi', 'Zigbee', 'DALI', 'TRIAC'], 'none')}</select></label>
      <label>Уровень цены<select id="lTier">${opt(['бюджет', 'средний', 'премиум'], 'средний')}</select></label>
      <label>&nbsp;<button class="b" id="lGo">Собрать комплект</button></label>
    </div>
    <div id="lOut" style="margin-top:12px"></div>
  </div>
  <div data-kp="track" class="card" hidden>
    <div class="grid g4">
      <label>Помещение (для КП)<input id="tRoom" placeholder="Кухня"></label>
      <label style="grid-column:span 2">Система<select id="tSys"></select></label>
      <label>Монтаж<select id="tMount">${opt(['накладной', 'подвесной', 'встраиваемый', 'натяжной'], 'накладной')}</select></label>
      <label>Цвет<select id="tCol">${opt([['черн', 'черный'], ['бел', 'белый']], 'черн')}</select></label>
      <label style="grid-column:span 2">Длины линий трека, м (через запятую)<input id="tRuns" value="3.6, 2.2"></label>
      <label>Углы L / T / X<div class="row" style="gap:4px"><input id="tL" type="number" min="0" value="1" style="width:56px"><input id="tT" type="number" min="0" value="0" style="width:56px"><input id="tX" type="number" min="0" value="0" style="width:56px"></div></label>
      <label>Светильников (подбор)<input id="tN" type="number" min="0" value="8"></label>
      <label>Их мощность, Вт<input id="tW" type="number" value="20"></label>
      <label>Tцв<select id="tCct">${opt(['', '2700', '3000', '4000'], '3000')}</select></label>
      <label>Уровень цены<select id="tTier">${opt(['бюджет', 'средний', 'премиум'], 'средний')}</select></label>
      <label style="grid-column:span 3">Или свои светильники: «артикул × шт» по строке<textarea id="tFix" rows="2" placeholder="TR010-1-20W3K-M-B × 6"></textarea></label>
      <label>&nbsp;<button class="b" id="tGo">Собрать трек</button></label>
    </div>
    <div id="tOut" style="margin-top:12px"></div>
  </div>
  <div data-kp="dali" class="card" hidden>
    <div class="grid g4">
      <label>DALI-устройств (драйверы, диммеры, блоки питания DALI)<input id="daDev" type="number" min="0" value="20"></label>
      <label>Датчиков<input id="daSen" type="number" min="0" value="0"></label>
      <label>Панелей управления<input id="daPan" type="number" min="0" value="2"></label>
      <label>Мастер-контроллер<select id="daMas">${opt([['basic', 'обычный'], ['smart', 'SMART (приложение)'], ['none', 'нет / свой']], 'basic')}</select></label>
      <label>&nbsp;<button class="b" id="daGo">Рассчитать</button></label>
    </div>
    <div class="row" style="margin-top:6px"><button class="b ghost sm" id="daFromKp">Посчитать DALI-устройства в текущем КП</button><span class="mute" id="daMsg"></span></div>
    <div id="daOut" style="margin-top:12px"></div>
  </div>`;
  el.querySelectorAll('#kTabs button').forEach(b => b.onclick = () => { el.querySelectorAll('#kTabs button').forEach(x => x.classList.toggle('on', x === b)); el.querySelectorAll('[data-kp]').forEach(d => d.hidden = d.dataset.kp !== b.dataset.k); });
  $('#tSys').innerHTML = KITS.trackSystems().map(s => `<option${/UNITY/.test(s) ? ' selected' : ''}>${esc(s)}</option>`).join('');
  const nums = s => String(s).split(/[,;\s]+/).map(v => parseFloat(v.replace(',', '.'))).filter(v => v > 0);
  function show(out, r, room) {
    if (r.error) { out.innerHTML = `<div class="note">${esc(r.error)}</div>`; return; }
    const info = r.info ? Object.entries({ 'Длина': r.info.total != null ? (+r.info.total).toFixed(1) + ' м' : null, 'Мощность ленты': r.info.P ? r.info.P + ' Вт' : null, 'Загрузка БП': r.info.load ? r.info.load + '%' : null,
      'Мощность светильников': r.info.fixW ? r.info.fixW + ' Вт' : null, 'Линий DALI': r.info.lines || null, 'Адресов': r.info.addr || null }).filter(([, v]) => v).map(([k, v]) => `<div><span class="mute">${k}</span><b>${v}</b></div>`).join('') : '';
    out.innerHTML = (info ? `<div class="kpi" style="margin-bottom:8px">${info}</div>` : '') + MTUI.rowsHTML(r.rows, { group: true }) + MTUI.warnHTML(r.warn) +
      `<div class="row" style="margin-top:8px"><button class="b" data-tokp>Добавить в КП${room ? ' — ' + esc(room) : ''}</button></div>`;
    out.querySelector('[data-tokp]').onclick = e => { MTUI.kp.add(r.rows.map(x => ({ room: room || x.room || '', a: x.a, qty: x.qty }))); e.target.textContent = 'Добавлено ✓'; };
    MTUI.TS.kits.push({ type: out.id, rows: r.rows, warn: r.warn, room });
  }
  $('#lGo').onclick = () => show($('#lOut'), KITS.lentaCalc({ segments: nums($('#lSegs').value).map(len => ({ len })), volt: +$('#lV').value, mode: $('#lMode').value, cct: +$('#lCct').value,
    wpm: +$('#lW').value || null, ip: +$('#lIp').value, profile: $('#lProf').value, profileColor: $('#lPCol').value, control: $('#lCtl').value, tier: $('#lTier').value, room: $('#lRoom').value }), $('#lRoom').value);
  $('#tGo').onclick = () => {
    const fixtures = $('#tFix').value.split(/\n/).map(l => l.match(/([A-Za-z0-9][\w.()\-\/]+)\s*[×x*]?\s*(\d+)?/)).filter(Boolean).map(m => ({ a: m[1], qty: +(m[2] || 1) })).filter(f => MT.get(f.a));
    show($('#tOut'), KITS.trackCalc({ system: $('#tSys').value, mount: $('#tMount').value, color: $('#tCol').value, runs: nums($('#tRuns').value), L: +$('#tL').value, T: +$('#tT').value, X: +$('#tX').value,
      fixtures, auto: fixtures.length ? null : { count: +$('#tN').value, w: +$('#tW').value, cct: $('#tCct').value }, tier: $('#tTier').value, room: $('#tRoom').value }), $('#tRoom').value);
  };
  $('#daGo').onclick = () => show($('#daOut'), KITS.daliCalc({ devices: +$('#daDev').value, sensors: +$('#daSen').value, panels: +$('#daPan').value, master: $('#daMas').value }), '');
  $('#daFromKp').onclick = () => {
    let dev = 0, sen = 0, pan = 0;
    MTUI.kp.get().rows.forEach(r => { const x = MT.get(r.a); if (!x || !MT.features(x).proto.has('DALI')) return; const k = MT.kind(x);
      if (k === 'датчик') sen += r.qty; else if (k === 'панель управления') pan += r.qty; else if (['драйвер', 'диммер', 'контроллер', 'блок питания', 'реле'].includes(k) && !/шины|мастер/i.test(x.n)) dev += r.qty; });
    $('#daDev').value = dev; $('#daSen').value = sen; $('#daPan').value = pan; $('#daMsg').textContent = `В КП: устройств ${dev}, датчиков ${sen}, панелей ${pan}.`;
  };
})();
