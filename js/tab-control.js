/* Вкладка «Управление»: подбор способа управления и оборудования (драйверы, диммеры, контроллеры, блоки питания, DALI, ZigBee, Wi-Fi, RF, TRIAC)
   на движке конфигуратора управления Maytoni (aurivio.github.io/smart-led). Источники берутся из КП или рабочего варианта. */
(function () {
  'use strict';
  const { $, esc, rub } = MTUI;
  const el = document.querySelector('section[data-p="ctl"]'); if (!el) return;
  const E = window.MaytoniEngine; if (!E) { el.innerHTML = '<div class="card">Модуль управления не загрузился.</div>'; return; }
  const OPT = {
    object: [['apartment', 'Квартира'], ['house', 'Частный дом'], ['room', 'Одна комната'], ['office', 'Офис'], ['restaurant', 'Ресторан, кафе'], ['retail', 'Магазин'], ['hotel', 'Отель'], ['commercial', 'Другой объект']],
    stage: [['before', 'до чистовой отделки'], ['finished', 'отделка завершена'], ['unknown', 'пока не знаю']],
    bus: [['approved', 'можно проложить'], ['existing', 'уже есть'], ['no', 'прокладка исключена'], ['unknown', 'пока не знаю']],
    internet: [['yes', 'есть'], ['no', 'нет'], ['unknown', 'пока не знаю']],
    budget: [['medium', 'средний'], ['low', 'минимальный'], ['high', 'выше среднего'], ['unknown', 'пока не знаю']],
    scenes: [['1-4', 'до 4 сцен'], ['5+', '5 и больше'], ['unknown', 'не нужны / не знаю']],
  };
  const CTL = [['wall', 'настенная панель'], ['remote', 'пульт'], ['phone', 'смартфон'], ['voice', 'голосовой помощник']];
  const sel = (id, list, v) => `<select id="${id}">${list.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  el.innerHTML = `
  <div class="card"><h3>Объект</h3>
    <div class="grid g4">
      <label>Тип объекта${sel('ctObj', OPT.object, 'apartment')}</label>
      <label>Стадия ремонта${sel('ctStage', OPT.stage, 'before')}</label>
      <label>Линия DALI (шина)${sel('ctBus', OPT.bus, 'approved')}</label>
      <label>Стабильный интернет${sel('ctNet', OPT.internet, 'yes')}</label>
      <label>Бюджет на управление${sel('ctBudget', OPT.budget, 'medium')}</label>
      <label>Сцены${sel('ctScenes', OPT.scenes, '1-4')}</label>
      <label style="grid-column:span 2">Как управлять<div class="row">${CTL.map(([k, t]) => `<label style="flex-direction:row;align-items:center;gap:4px;color:var(--ink)"><input type="checkbox" data-ctl="${k}" ${k === 'wall' || k === 'phone' ? 'checked' : ''} style="width:auto">${t}</label>`).join('')}</div></label>
    </div></div>
  <div class="card"><h3>Источники света</h3>
    <div class="row" style="margin-bottom:8px"><button class="b ghost" id="ctFromKp">Взять из КП / рабочего варианта</button><span class="mute" id="ctMsg">Светильники, ленты и треки группируются по помещениям. Для LED-светильников ток и мощность драйвера берутся из базы конфигуратора.</span></div>
    <div class="scroll" style="max-height:none"><table class="t" id="ctTab"></table></div>
    <div class="row" style="margin-top:10px"><button class="b" id="ctGo">Подобрать управление</button></div></div>
  <div id="ctOut"></div>`;
  let sources = [], rooms = [], ev = null, chosen = 0, eqRows = [];
  const FEAT = [['dim', 'яркость'], ['cct', 'оттенок белого'], ['rgb', 'цвет']];
  function fromRows(rows) {
    const rmap = new Map(), src = new Map();
    for (const r of rows) {
      const x = MT.get(r.a); if (!x) continue;
      const k = MT.kind(x), f = MT.features(x), room = r.room || 'Помещение';
      if (MT.cls(x) === 'source' || ['комплектующие', 'аксессуар', 'профиль', 'блок питания', 'контроллер', 'диммер', 'пульт', 'шлюз', 'датчик', 'шинопровод', 'драйвер', 'панель управления', 'реле', 'усилитель', 'конвертер'].includes(k)) continue;
      if (!rmap.has(room)) rmap.set(room, 'r' + (rmap.size + 1));
      const key = room + '|' + r.a; let s = src.get(key);
      if (!s) {
        s = { id: 's' + (src.size + 1), roomId: rmap.get(room), room, a: x.a, name: `${x.a} · ${(x.n || '').slice(0, 50)}`, units: 0, unitPower: '', current: '', driversPer: '', ledV: '', voltage: '', length: '', wpm: '', features: ['onoff', 'dim'], phaseDim: 'unknown', neutral: 'unknown', wet: MT.normFor(room).id === 'bath' ? 'yes' : 'no', trackLamp: 'led', multiCct: '' };
        const lum = E.LUMS[x.a];
        if (k === 'лента') {
          const m = f.mode || 'mono'; s.kind = m === 'MIX' ? 'strip_cct' : m === 'RGB' ? 'strip_rgb' : m === 'RGBW' ? 'strip_rgbw' : 'strip_mono';
          if (m === 'MIX') s.features = ['onoff', 'dim', 'cct']; if (m === 'RGB' || m === 'RGBW') s.features = ['onoff', 'dim', 'rgb'];
          s.wpm = x.w || ''; s.voltage = f.volt ? f.volt.lo : 24; if (E.STRIPS[x.a]) s.stripSku = x.a; s._reel = (x.l || 5000) / 1000;
          const ml = String(r.note || '').match(/([\d.]+)\s*м/); s._len = ml ? +ml[1] : 0;
        } else if (k === 'трековый' || k === 'трековый подвесной') { s.kind = /магнит|48|низковольт/i.test(x.c || '') ? 'track48' : 'track230'; s.unitPower = x.w || ''; }
        else if (lum) { s.kind = lum.fixed ? 'led_fixed' : 'led_repl'; s.current = lum.i || ''; s.unitPower = lum.w || ''; s.driversPer = lum.n || 1; s.ledV = lum.v ? [].concat(lum.v).join('-') : ''; s.lumSku = x.a; }
        else if (f.cap) { s.kind = 'lamp'; s.unitPower = 8; s._nl = f.nl || 1; }
        else { s.kind = 'led_repl'; s.unitPower = x.w || ''; }
        src.set(key, s);
      }
      if (s.kind && s.kind.startsWith('strip_')) s.length = +(s._len || (+s.length || 0) + r.qty * s._reel).toFixed(1); else s.units += r.qty * (s._nl || 1);
    }
    rooms = [...rmap.entries()].map(([name, id]) => ({ id, name }));
    sources = [...src.values()];
  }
  function drawSrc() {
    if (!sources.length) { $('#ctTab').innerHTML = '<tr><td class="mute">Нажмите «Взять из КП» — или сначала соберите КП на других вкладках.</td></tr>'; return; }
    let h = '<tr><th>Помещение</th><th>Источник</th><th>Тип</th><th class="num">Шт / м</th><th class="num">Вт на шт / Вт/м</th><th class="num">Ток, мА</th><th>Что регулировать</th></tr>';
    sources.forEach((s, i) => {
      const isStrip = s.kind.startsWith('strip_');
      h += `<tr><td>${esc(s.room)}</td><td>${MTUI.img(MT.get(s.a), 30)} ${esc(s.name)}</td>
        <td><select data-i="${i}" data-f="kind">${Object.entries(E.KINDS).map(([k, v]) => `<option value="${k}"${k === s.kind ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></td>
        <td class="num"><input data-i="${i}" data-f="${isStrip ? 'length' : 'units'}" value="${isStrip ? s.length : s.units}" style="width:60px"></td>
        <td class="num"><input data-i="${i}" data-f="${isStrip ? 'wpm' : 'unitPower'}" value="${isStrip ? s.wpm : s.unitPower}" style="width:60px"></td>
        <td class="num">${isStrip ? '—' : `<input data-i="${i}" data-f="current" value="${s.current}" style="width:60px" placeholder="?">`}</td>
        <td>${FEAT.map(([k, t]) => `<label style="flex-direction:row;align-items:center;gap:3px;color:var(--ink);display:inline-flex;margin-right:6px"><input type="checkbox" data-i="${i}" data-feat="${k}" ${s.features.includes(k) ? 'checked' : ''} style="width:auto">${t}</label>`).join('')}</td></tr>`;
    });
    $('#ctTab').innerHTML = h;
    $('#ctTab').querySelectorAll('[data-f]').forEach(x => x.onchange = () => { sources[+x.dataset.i][x.dataset.f] = x.value; if (x.dataset.f === 'kind') drawSrc(); });
    $('#ctTab').querySelectorAll('[data-feat]').forEach(x => x.onchange = () => { const s = sources[+x.dataset.i]; s.features = ['onoff', ...FEAT.map(f => f[0]).filter(k => k === x.dataset.feat ? x.checked : s.features.includes(k))]; });
  }
  function project() {
    const controls = [...el.querySelectorAll('[data-ctl]')].filter(c => c.checked).map(c => c.dataset.ctl);
    const sc = $('#ctScenes').value;
    return { object: $('#ctObj').value, stage: $('#ctStage').value, bus: $('#ctBus').value, internet: $('#ctNet').value, budget: $('#ctBudget').value,
      controls: controls.length ? controls : ['unknown'], extras: sc === 'unknown' ? ['none'] : ['scenes'], scenes: sc, rooms, sources };
  }
  $('#ctFromKp').onclick = () => { const rows = window.PROJECT && PROJECT.data ? PROJECT.data.rows : MTUI.kp.get().rows; fromRows(rows); drawSrc(); $('#ctMsg').textContent = `Источников: ${sources.length} в ${rooms.length} помещениях${window.PROJECT && PROJECT.data ? ` (рабочий вариант «${PROJECT.data.variant}»)` : ' (из КП)'}.`; };
  $('#ctGo').onclick = () => {
    if (!sources.length) $('#ctFromKp').click();
    if (!sources.length) return;
    try { ev = E.evaluate(project()); } catch (e) { $('#ctOut').innerHTML = `<div class="card note">Ошибка подбора: ${esc(e.message)}</div>`; return; }
    chosen = 0; render();
  };
  const li = arr => (arr || []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('');
  function itemRow(it, room) {
    const sku = (it.skus || []).find(a => MT.get(a)) || (it.skus || [])[0], x = sku && MT.get(sku);
    if (sku && !it.generic) eqRows.push({ room: room || '', a: sku, qty: it.qty || 1, note: it.type });
    return `<tr><td>${esc(room || 'Весь объект')}</td><td>${esc(it.type)}</td><td>${sku ? `<b>${esc(sku)}</b>${it.skus.length > 1 ? `<div class="mute">или ${esc(it.skus.slice(1, 4).join(', '))}</div>` : ''}` : '<span class="mute">по месту</span>'}</td>
      <td>${x ? esc((x.n || '').slice(0, 70)) : ''}</td><td class="num">${it.qty || 1}</td><td class="num">${x ? rub(x.p) : '—'}</td>
      <td class="mute">${esc([...(it.notes || []), ...(it.pending || [])].join(' '))}${it.issue ? `<div style="color:var(--bad)">${esc(it.issue)}</div>` : ''}</td></tr>`;
  }
  function render() {
    if (!ev.options.length) {
      $('#ctOut').innerHTML = `<div class="card"><h3>Решения без изменений условий нет</h3>${(ev.possible || []).length ? '<p>Возможно, если:</p><ul>' + ev.possible.map(p => `<li><b>${esc(p.title)}</b>: ${esc(p.changes.join('; '))}. ${esc(p.gain || '')}</li>`).join('') + '</ul>' : ''}${(ev.whyNot || []).length ? '<p>Почему не подошли:</p><ul>' + ev.whyNot.map(w => `<li><b>${esc(w.title)}</b>: ${esc(w.reasons.join(' '))}</li>`).join('') + '</ul>' : ''}</div>`; return;
    }
    const o = ev.options[chosen];
    let h = '<div class="card"><h3>Способы управления</h3><div class="grid g3">' + ev.options.map((x, i) => `<div class="card" data-o="${i}" style="margin:0;cursor:pointer;${i === chosen ? 'border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)' : ''}"><div class="big" style="font-size:18px">${esc(x.title)}</div>
      ${x.pros && x.pros.length ? `<ul style="margin:6px 0;padding-left:18px;font-size:13px">${li(x.pros)}</ul>` : ''}${x.cons && x.cons.length ? `<div class="mute">Минусы:</div><ul style="margin:4px 0;padding-left:18px;font-size:12px">${li(x.cons)}</ul>` : ''}${x.caveats && x.caveats.length ? `<div class="mute">Особенности:</div><ul style="margin:4px 0;padding-left:18px;font-size:12px">${li(x.caveats)}</ul>` : ''}</div>`).join('') + '</div>';
    if (o.pending && o.pending.length) h += `<div class="note" style="margin-top:8px"><b>Уточнить:</b><ul style="margin:4px 0 0;padding-left:18px">${li([...new Set(o.pending)])}</ul></div>`;
    let eq; try { eq = E.buildEquipment(project(), o); } catch (e) { $('#ctOut').innerHTML = h + `<div class="note">Ошибка подбора оборудования: ${esc(e.message)}</div></div>`; return; }
    eqRows = [];
    let t = '<table class="t" style="margin-top:12px"><tr><th>Помещение</th><th>Что</th><th>Артикул</th><th>Наименование</th><th class="num">Кол-во</th><th class="num">РРЦ</th><th>Примечание</th></tr>';
    (eq.project || []).forEach(it => { t += itemRow(it, ''); });
    (eq.rooms || []).forEach(r => {
      (r.zones || []).forEach(z => { t += `<tr><td colspan="7" style="background:#f6f4ef"><b>${esc(r.name)}</b> · ${esc(z.name)} — ${esc(z.method || '')}${(z.pending || []).length ? ` <span class="mute">(${esc(z.pending.join(' '))})</span>` : ''}</td></tr>`;
        (z.items || []).forEach(it => { t += itemRow(it, r.name); });
        if ((z.variants || []).length) { const v = z.variants[0]; t += `<tr><td></td><td colspan="6" class="mute">${esc(v.title)}${z.variants.length > 1 ? ` (есть ещё ${z.variants.length - 1} вариант)` : ''}</td></tr>`; (v.items || []).forEach(it => { t += itemRow(it, r.name); }); } });
      (r.roomItems || []).forEach(it => { t += itemRow(it, r.name); });
    });
    t += '</table>';
    if (eq.dali) t += `<div class="note" style="margin-top:8px"><b>DALI:</b> ${esc(JSON.stringify(eq.dali).slice(0, 300))}</div>`;
    h += t + `<div class="row" style="margin-top:10px"><button class="b" id="ctToKp">Оборудование управления → в КП</button><span class="mute">Позиции «по месту» и «уточнить» в КП не добавляются.</span></div></div>`;
    $('#ctOut').innerHTML = h;
    $('#ctOut').querySelectorAll('[data-o]').forEach(d => d.onclick = () => { chosen = +d.dataset.o; render(); });
    $('#ctToKp').onclick = e => { const rows = eqRows.filter(r => MT.get(r.a)); MTUI.kp.add(rows.map(r => ({ room: r.room, a: r.a, qty: r.qty })));
      if (window.PROJECT && PROJECT.data) { PROJECT.data.rows.push(...rows.map(r => ({ room: r.room || 'Весь объект', a: r.a, qty: r.qty, note: r.note, group: 'Управление' }))); }
      e.target.textContent = `Добавлено: ${rows.length} поз.`; };
  }
  drawSrc();
  window.addEventListener('tab-shown', e => { if (e.detail === 'ctl' && !sources.length && (MTUI.kp.get().rows.length || (window.PROJECT && PROJECT.data))) $('#ctFromKp').click(); });
})();
