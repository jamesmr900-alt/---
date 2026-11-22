/* Из конфигуратора управления освещением Maytoni (aurivio.github.io/smart-led), без изменений. */

/* Движок подбора управления освещением Maytoni, версия 5.
   1) Для каждого источника (зоны) определяется, какими методами им можно управлять.
   2) Варианты: один метод на весь объект → основной метод + дополнение → комбинация местных методов
      с минимальным числом методов. SPI всегда отдельной подсистемой.
   3) Метки: recommended / fits / caveats. «Возможно, если…» — что изменить в условиях.
   4) Оборудование: подбор по нагрузке, току, напряжению и числу каналов (1 канал = 1 зона). */
(function (root) {
  const CAT = (typeof module !== 'undefined' && module.exports) ? require('./catalog.js') : root.MaytoniCatalog;
  const { CATALOG, KIT, PHASE_K, RESERVE, STRIPS, LUMS } = CAT;

  const KINDS = {
    lamp:        { cat: 'lum',   label: 'Светильник под сменную лампу 230 В', v230: true, feats: ['onoff', 'dim', 'cct', 'rgb'] },
    led_repl:    { cat: 'lum',   label: 'LED-светильник, драйвер можно заменить', feats: ['onoff', 'dim', 'cct'] },
    led_fixed:   { cat: 'lum',   label: 'LED-светильник, драйвер заменить нельзя', v230: true, feats: ['onoff'] },
    lowv:        { cat: 'lum',   label: 'Низковольтный светильник 12–24 В', cv: true, feats: ['onoff', 'dim', 'cct', 'rgb'] },
    strip_mono:  { cat: 'strip', label: 'Одноцветная лента', cv: true, feats: ['onoff', 'dim'] },
    strip_cct:   { cat: 'strip', label: 'Лента тёплый ↔ холодный белый (MIX)', cv: true, feats: ['onoff', 'dim', 'cct'] },
    strip_rgb:   { cat: 'strip', label: 'Цветная лента RGB', cv: true, feats: ['onoff', 'dim', 'rgb'] },
    strip_rgbw:  { cat: 'strip', label: 'Цветная лента + белый (RGBW)', cv: true, feats: ['onoff', 'dim', 'rgb'] },
    strip_rgbcct:{ cat: 'strip', label: 'Цветная лента + тёплый/холодный (RGB+MIX)', cv: true, feats: ['onoff', 'dim', 'cct', 'rgb'] },
    strip_spi:   { cat: 'strip', label: 'Динамическая лента (SPI)', spi: true, feats: ['onoff', 'dim', 'rgb', 'fx'] },
    strip_nc:    { cat: 'strip', label: 'Лента без управления', cv: true, feats: ['onoff'] },
    track230:    { cat: 'track', label: 'Трековая система 230 В', v230: true, feats: ['onoff', 'dim'] },
    track24:     { cat: 'track', label: 'Трековая система 24 В', cv: true, volt: 24, feats: ['onoff', 'dim'] },
    track48:     { cat: 'track', label: 'Трековая система 48 В', volt: 48, feats: ['onoff', 'dim', 'cct'] }
  };
  const TITLES = { ZIGBEE: 'ZigBee', WIFI: 'Wi-Fi', DALI: 'DALI', TRIAC: 'TRIAC', RF: 'RF ШИМ', SWITCH: 'Обычный выключатель', SPI: 'SPI' };
  const SYSTEM = ['ZIGBEE', 'WIFI', 'DALI'];
  const LOCAL = ['TRIAC', 'RF', 'SWITCH'];
  const DIGITAL = ['ZIGBEE', 'WIFI'];          // смартфон «из коробки»
  const PHONE_OK = ['ZIGBEE', 'WIFI', 'DALI'];  // DALI — через конвертер Wi-Fi/RF 721005

  const num = v => (v === '' || v == null || !isFinite(Number(v)) || Number(v) <= 0) ? null : Number(v);
  const kindOf = s => KINDS[s.kind] || null;
  const srcName = s => s.name || (kindOf(s) ? kindOf(s).label : 'Источник');
  const voltageOf = s => (kindOf(s) && kindOf(s).volt) || num(s.voltage);
  function loadOf(s) {
    const direct = num(s.load); if (direct !== null) return direct;
    if (s.kind && s.kind.startsWith('strip_')) { const l = num(s.length), w = num(s.wpm); return l !== null && w !== null ? Math.round(l * w * 10) / 10 : null; }
    const p = num(s.unitPower), n = num(s.units); return p !== null && n !== null ? Math.round(p * n * 10) / 10 : null;
  }
  function needs(s) {
    const f = new Set((s.features || []).filter(x => x !== 'unknown'));
    const unknown = !f.size;
    return { dim: f.has('dim'), cct: f.has('cct'), rgb: f.has('rgb'), fx: f.has('fx'), color: f.has('cct') || f.has('rgb'), onlyOnOff: !unknown && !f.has('dim') && !f.has('cct') && !f.has('rgb') && !f.has('fx'), unknown };
  }

  /* Трек 230 В со светильниками под лампу работает по логике светильников под лампу */
  function norm(s) {
    if (s && s.kind === 'track230' && s.trackLamp === 'lamp') return Object.assign({}, s, { kind: 'lamp', _label: 'Трековая система 230 В · светильники под лампу' });
    return s;
  }
  const normP = p => Object.assign({}, p, { sources: (p.sources || []).map(norm) });

  /* ---------- Возможности метода для одного источника ---------- */
  function capability(method, s, override) {
    const k = kindOf(s); const n = override || needs(s); const pending = [];
    const ok = () => ({ ok: true, pending });
    const no = reason => ({ ok: false, reason, pending });
    if (!k) return { ok: true, pending: ['Уточните тип источника «' + srcName(s) + '».'] };
    if (k.spi) return no('Динамическая лента управляется отдельным SPI-контроллером.');
    if (n.unknown) pending.push('Уточните, что нужно менять у источника «' + srcName(s) + '».');
    if (['led_repl', 'lowv'].includes(s.kind) && n.cct && s.multiCct !== 'yes') pending.push(srcName(s) + ': уточните, можно ли у светильника менять цветовую температуру.');
    const v = voltageOf(s);
    const phase = () => {
      if (!n.dim) return null;
      if (s.phaseDim === 'no') return srcName(s) + ': не поддерживает фазовое диммирование (TRIAC).';
      if (s.phaseDim !== 'yes') pending.push(srcName(s) + ': подтвердите поддержку диммирования TRIAC (диммируемые лампы или светильники).');
      return null;
    };
    const onlySwitchKinds = ['led_fixed'];
    if (method === 'SWITCH') return n.onlyOnOff || n.unknown ? ok() : no('Обычный выключатель только включает и выключает свет.');
    if (s.kind === 'strip_nc') return ['WIFI', 'ZIGBEE', 'DALI'].includes(method) ? ok() : no('Лента не управляется контроллерами — только включение и выключение по сети 230 В.');
    if (onlySwitchKinds.includes(s.kind) && !n.onlyOnOff && !n.unknown) return no(srcName(s) + ': драйвер встроен в корпус и не заменяется — возможно только включение и выключение.');

    if (method === 'TRIAC') {
      if (n.color) return no('TRIAC регулирует только яркость, без оттенка белого и цвета.');
      if (['lamp', 'track230'].includes(s.kind)) { const p = phase(); return p ? no(p) : ok(); }
      if (['led_repl', 'led_fixed'].includes(s.kind)) return ok();
      if (['track24', 'lowv', 'strip_mono'].includes(s.kind)) return ok();
      return no(k.label + ': по TRIAC не управляется.');
    }
    if (method === 'RF') {
      if (!(s.kind.startsWith('strip_') || ['lowv', 'track24'].includes(s.kind))) return no(k.label + ': RF ШИМ управляет только лентами и светильниками 12–48 В.');
      if (v === 48 && n.color) return no('Для 48 В в RF есть только диммер яркости.');
      return ok();
    }
    if (s.kind === 'lamp' && n.color && method !== 'WIFI') return no('Оттенок белого и цвет для ламп 230 В — только с Wi-Fi-лампами.');
    if (method === 'WIFI' && s.kind === 'lamp') return ok();
    if (method === 'WIFI' || method === 'ZIGBEE') {
      if (['lamp', 'track230'].includes(s.kind)) { if (n.color) return no(k.label + ': фазовое управление не меняет оттенок и цвет.'); const p = phase(); return p ? no(p) : ok(); }
      if (s.kind === 'led_fixed') return ok();
      if (s.kind === 'led_repl') {
        if (n.rgb) return no('Для RGB-светильников с драйвером в матрице нет решения.');
        if (method === 'WIFI' && n.cct) return no('Wi-Fi-диммер регулирует только яркость, без оттенка белого.');
        if (method === 'ZIGBEE' && n.cct) return no('Драйверы ZigBee регулируют только яркость, без оттенка белого.');
        return ok();
      }
      if (s.kind === 'track48') {
        if (method === 'WIFI') return n.onlyOnOff || n.unknown ? ok() : no('Трек 48 В по Wi-Fi можно только включать и выключать.');
        return n.rgb ? no('Трек 48 В: цвет RGB не поддерживается.') : ok();
      }
      if (k.cv) return ok();
      return no(k.label + ': нет решения ' + TITLES[method] + '.');
    }
    if (method === 'DALI') {
      if (['lamp', 'track230'].includes(s.kind)) { if (n.color) return no(k.label + ': фазовое управление не меняет оттенок и цвет.'); const p = phase(); return p ? no(p) : ok(); }
      if (s.kind === 'led_fixed') return ok();
      if (s.kind === 'led_repl') return n.rgb ? no('Драйверы DALI не управляют цветом RGB.') : ok();
      if (s.kind === 'track48') return n.rgb ? no('Трек 48 В: цвет RGB не поддерживается.') : ok();
      if (s.kind === 'strip_rgbcct') return no('Для ленты RGB+MIX в DALI нет решения.');
      if (k.cv) { if (v === 48 && n.color) return no('Контроллеры DALI DT8 работают с 12–24 В.'); return ok(); }
      return no(k.label + ': нет решения DALI.');
    }
    return no('Неизвестный метод.');
  }

  /* ---------- Условия проекта для системных методов ---------- */
  function controlsInfo(p) {
    const c = (p.controls || []).filter(x => x !== 'unknown');
    return { known: !(p.controls || []).includes('unknown') && c.length > 0, list: c, digital: c.some(x => x === 'phone' || x === 'voice'), wall: c.includes('wall'), remote: c.includes('remote') };
  }
  function gate(method, p, zonesCount) {
    const fail = [], pending = [], ctl = controlsInfo(p);
    if (method === 'ZIGBEE' || method === 'WIFI') {
      if (p.internet === 'no') fail.push({ reason: 'Нет стабильного интернета.', fix: { internet: 'yes' }, change: 'Провести стабильный интернет' });
      else if (p.internet !== 'yes') pending.push('Подтвердите наличие стабильного интернета.');
      if (ctl.known && !ctl.digital) fail.push({ reason: 'Не выбрано управление со смартфона или голосом.', fix: { addControl: 'phone' }, change: 'Добавить управление со смартфона или голосом' });
      else if (!ctl.known) pending.push('Уточните способ управления.');
    }
    if (method === 'DALI') {
      if (p.object === 'room') fail.push({ reason: 'Для одной комнаты DALI не предлагается.' });
      if (p.bus === 'existing') { /* шина есть — подходит при любой стадии */ }
      else if (p.stage === 'finished') fail.push({ reason: 'Ремонт завершён, а шины DALI нет.' });
      else if (p.stage === 'before') {
        if (p.bus === 'no') fail.push({ reason: 'Прокладка шины DALI невозможна.', fix: { bus: 'approved' }, change: 'Согласовать прокладку шины DALI' });
        else if (p.bus !== 'approved') pending.push('Подтвердите возможность проложить шину DALI.');
      } else pending.push('Уточните стадию ремонта и наличие шины DALI.');
    }
    return { fail, pending };
  }
  function applyFix(p, fix) {
    const q = JSON.parse(JSON.stringify(p));
    if (fix.internet) q.internet = fix.internet;
    if (fix.budget) q.budget = fix.budget;
    if (fix.bus) q.bus = fix.bus;
    if (fix.addControl) q.controls = [...new Set([...(q.controls || []).filter(x => x !== 'unknown'), fix.addControl])];
    return q;
  }

  /* ---------- Варианты ---------- */
  function localPreference(s, methods, override) {
    const n = override || needs(s), k = kindOf(s) || {};
    let order;
    if (n.onlyOnOff) order = ['SWITCH', 'TRIAC', 'RF'];
    else if (k.cv) order = ['RF', 'TRIAC', 'SWITCH'];
    else order = ['TRIAC', 'RF', 'SWITCH'];
    return order.filter(m => methods.includes(m));
  }
  function subsets(arr) {
    const out = [];
    for (let mask = 1; mask < (1 << arr.length); mask++) out.push(arr.filter((_, i) => mask & (1 << i)));
    return out.sort((a, b) => a.length - b.length);
  }

  function evaluate(p) {
    p = normP(p);
    const sources = p.sources || [];
    const base = sources.filter(s => !(kindOf(s) && kindOf(s).spi));
    const spi = sources.filter(s => kindOf(s) && kindOf(s).spi);
    const ctl = controlsInfo(p);
    const extras = new Set(p.extras || []);
    const wantScenes = extras.has('scenes'), wantAuto = extras.has('automation') || extras.has('integration');
    const out = { options: [], possible: [], whyNot: [], degraded: [], spi: spi.map(s => s.id), insufficient: false };
    if (!sources.length || sources.every(s => !kindOf(s))) { out.insufficient = true; return out; }

    // Источники, которые ни одним методом не дают запрошенное: понижаем до вкл/выкл.
    const eff = {};
    for (const s of base) {
      const all = [...SYSTEM, ...LOCAL].map(m => capability(m, s));
      if (all.some(c => c.ok)) { eff[s.id] = null; continue; }
      const reason = (capability('WIFI', s).reason || capability('TRIAC', s).reason);
      out.degraded.push({ id: s.id, name: srcName(s), reason });
      eff[s.id] = { dim: false, cct: false, rgb: false, fx: false, color: false, onlyOnOff: true, unknown: false };
    }
    const cap = (m, s) => capability(m, s, eff[s.id]);
    const capTable = {};
    for (const s of base) { capTable[s.id] = {}; for (const m of [...SYSTEM, ...LOCAL]) capTable[s.id][m] = cap(m, s); }

    const make = (methods, assign) => {
      const o = { methods, assign, title: '', caveats: [], cons: [], pending: [], rooms: {} };
      for (const s of base) for (const x of capTable[s.id][assign[s.id]].pending) o.pending.push(x);
      for (const m of methods) if (SYSTEM.includes(m)) for (const x of gate(m, p, zonesFor(m, assign)).pending) o.pending.push(x);
      for (const d of out.degraded) o.caveats.push(d.reason.startsWith(d.name) ? d.reason : d.name + ': ' + d.reason);
      if (ctl.digital) {
        const off = base.filter(s => !PHONE_OK.includes(assign[s.id]));
        if (off.length === base.length) o.caveats.push('Управление со смартфона в этом варианте недоступно.');
        else if (off.length) o.caveats.push('Без смартфона: ' + off.map(s => srcName(s) + ' — ' + TITLES[assign[s.id]].toLowerCase()).join('; ') + '. Остальным можно управлять со смартфона.');
      }
      const noScene = base.filter(s => ['TRIAC', 'SWITCH'].includes(assign[s.id]));
      if (wantScenes && noScene.length) o.caveats.push('Сцены недоступны для: ' + noScene.map(srcName).join(', ') + '.');
      if (wantScenes && p.scenes === '5+' && base.some(s => assign[s.id] === 'RF')) o.caveats.push('Пульт RF хранит до 4 сцен.');
      const motionRooms = (p.rooms || []).filter(r => r.motion && !base.some(s => s.roomId === r.id && SYSTEM.includes(assign[s.id])));
      if (false && motionRooms.length) o.caveats.push('Включение по датчику движения в этом варианте не подбирается: ' + motionRooms.map(r => r.name).join(', ') + '.');
      const noAuto = base.filter(s => !SYSTEM.includes(assign[s.id]));
      if (wantAuto && noAuto.length) o.caveats.push('Автоматизация и умный дом недоступны для: ' + noAuto.map(srcName).join(', ') + '.');
      if (methods.includes('WIFI') && zonesFor('WIFI', assign) > 10) o.caveats.push('На Wi-Fi больше 10 зон — это большая нагрузка на домашнюю сеть. Для такого объекта лучше ZigBee.');
      if (!wantScenes && methods.length > 1 && !methods.some(m => SYSTEM.includes(m))) o.cons.push('Нет общих сцен на весь объект.');
      if (methods.length === 1 && SYSTEM.includes(methods[0])) o.cons.push(methods[0] === 'DALI' ? 'Нужна отдельная линия управления (шина DALI).' : 'Нужен стабильный интернет.');
      if (methods.includes('DALI')) {
        o.pros = ['Настенные панели и сохранённые сцены работают без интернета'];
        if (ctl.digital) o.pros.push('Смартфон и голос — через конвертер Wi-Fi/RF DALI 721005');
        if (ctl.digital && p.internet === 'no') o.caveats.push('Для управления со смартфона и голосом через конвертер DALI нужен интернет.');
      } else if (!methods.some(m => DIGITAL.includes(m))) o.pros = ['Работает без интернета'];
      else o.pros = ['Управление со смартфона' + (methods.includes('ZIGBEE') ? ', голосом, сцены и расписания' : ' и голосом')];
      if (methods.filter(m => ['ZIGBEE', 'WIFI', 'DALI'].includes(m)).length > 1) o.pros.push('Все устройства управляются из одного приложения');
      o.pending = [...new Set(o.pending)];
      o.title = methods.map((m, i) => m === 'SWITCH' && methods.length > 1 ? 'обычный выключатель' : TITLES[m]).join(' + ');
      if (methods.length === 1) o.kind = 'single'; else if (SYSTEM.includes(methods[0])) o.kind = 'hybrid'; else o.kind = 'combo';
      return o;
    };
    const zonesFor = (m, assign) => base.filter(s => assign[s.id] === m).length;
    const assignAll = m => Object.fromEntries(base.map(s => [s.id, m]));
    const covers = (m, list) => list.every(s => capTable[s.id][m].ok);
    const wifiExtra = !gate('WIFI', p, 0).fail.length;
    const minimalLocal = (list, primary) => {
      if (!list.length) return { methods: [], assign: {} };
      const pool = ['TRIAC', 'RF', ...(wifiExtra && primary && primary !== 'WIFI' ? ['WIFI'] : [])];
      for (const sub of [[], ...subsets(pool)].map(x => [...x, 'SWITCH'])) {
        if (!list.every(s => sub.some(m => capTable[s.id][m].ok))) continue;
        const assign = {};
        for (const s of list) assign[s.id] = [...localPreference(s, sub, eff[s.id]), ...(sub.includes('WIFI') ? ['WIFI'] : [])].find(m => capTable[s.id][m].ok);
        if (list.some(s => !assign[s.id])) continue;
        const used = [...LOCAL, 'WIFI'].filter(m => Object.values(assign).includes(m));
        return { methods: used, assign };
      }
      return null;
    };

    if (base.length) {
      // 1. Один метод на весь объект
      for (const m of [...SYSTEM, ...LOCAL]) {
        if (!covers(m, base)) continue;
        if (['TRIAC', 'RF'].includes(m) && base.some(s => needs(s).onlyOnOff || eff[s.id]) && base.some(s => capTable[s.id].SWITCH.ok)) continue;
        if (SYSTEM.includes(m) && gate(m, p, base.length).fail.length) continue;
        out.options.push(make([m], assignAll(m)));
      }
      // 2. Основной системный метод + дополнение местными
      for (const m of SYSTEM) {
        const g = gate(m, p, base.filter(s => capTable[s.id][m].ok).length);
        if (g.fail.length) continue;
        const inM = base.filter(s => capTable[s.id][m].ok), rest = base.filter(s => !capTable[s.id][m].ok);
        if (!inM.length || !rest.length) continue;
        const loc = minimalLocal(rest, m); if (!loc) continue;
        out.options.push(make([m, ...loc.methods], Object.assign(Object.fromEntries(inM.map(s => [s.id, m])), loc.assign)));
      }
      // 3. Комбинация местных методов
      const singleLocal = out.options.some(o => o.methods.length === 1 && LOCAL.includes(o.methods[0]));
      const counted = ms => ms.filter(m => m !== 'SWITCH').length;
      if (!singleLocal) {
        const loc = minimalLocal(base);
        if (loc && loc.methods.length > 1) out.options.push(make(loc.methods, loc.assign));
      else if (loc && loc.methods.length === 1 && !out.options.some(o => o.methods[0] === loc.methods[0] && o.methods.length === 1)) out.options.push(make(loc.methods, loc.assign));
      }
    }
    // Без ленты SPI отдельно: только подсистема SPI
    if (!base.length && spi.length) out.options.push({ methods: ['SPI'], assign: {}, title: 'SPI', caveats: [], cons: [], pending: [], pros: ['Динамические эффекты'], kind: 'single' });

    const dropped = {};
    if (ctl.digital && out.options.some(o => o.methods.some(m => PHONE_OK.includes(m)))) {
      for (const o of out.options) if (!o.methods.some(m => PHONE_OK.includes(m)) && o.methods.length === 1) dropped[o.methods[0]] = 'Не поддерживает управление со смартфона и голосом.';
      out.options = out.options.filter(o => o.methods.some(m => PHONE_OK.includes(m)));
    }
    // Ранжирование
    const pref = o => {
      let v = 0; const big = ['house', 'office', 'restaurant', 'retail', 'hotel', 'commercial'].includes(p.object);
      const first = o.methods[0];
      if (first === 'ZIGBEE' || first === 'WIFI') v += 3;
      if (first === 'DALI') v += (big ? 2 : 1) + (ctl.wall && !ctl.digital ? 1 : 0);
      if (ctl.digital && DIGITAL.includes(first)) v += 2;
      return v;
    };
    out.options.forEach(o => { o._wish = o.caveats.length; o._pref = pref(o); });
    out.options.sort((a, b) => (a._wish > 0) - (b._wish > 0) || (a.pending.length > 0) - (b.pending.length > 0) || a.methods.filter(m => m !== 'SWITCH').length - b.methods.filter(m => m !== 'SWITCH').length || b._pref - a._pref);
    for (const o of out.options.slice(3)) if (o.methods.length === 1) dropped[o.methods[0]] = 'Подходит, но уступает показанным вариантам.';
    out.options = out.options.slice(0, 3);
    const keyOf = o => [o.caveats.length > 0, o.pending.length > 0, o.methods.filter(m => m !== 'SWITCH').length, o._pref].join('|');
    out.options.forEach((o, i) => {
      const clean = !o.caveats.length; // «Нужно уточнить» показывается отдельно и не понижает метку
      o.label = clean && keyOf(o) === keyOf(out.options[0]) ? 'recommended' : clean ? 'fits' : 'caveats';
    });
    if (out.options.length && out.options[0].label !== 'recommended' && !out.options.some(o => o.label === 'recommended') && !out.options[0].pending.length) out.options[0].label = 'recommended';

    // «Возможно, если…»
    const used = new Set(out.options.filter(o => o.methods.length === 1).map(o => o.methods[0]));
    for (const m of SYSTEM) {
      if (used.has(m) || !base.length || !covers(m, base)) continue;
      const g = gate(m, p, base.length);
      if (!g.fail.length || g.fail.some(f => !f.fix)) continue;
      let q = p; for (const f of g.fail) q = applyFix(q, f.fix);
      if (gate(m, q, base.length).fail.length) continue;
      const gain = { ZIGBEE: 'Одна система на весь объект: общие сцены, расписания, смартфон и голос.', WIFI: 'Управление из приложения без отдельного хаба. До 10 зон на объект.', DALI: 'Проводная система с настенными панелями и сохранёнными сценами.' }[m];
      out.possible.push({ method: m, title: TITLES[m], changes: g.fail.map(f => f.change), fixes: g.fail.map(f => f.fix), gain });
    }

    // «Почему не подошли»
    const inOptions = new Set(out.options.flatMap(o => o.methods.length === 1 ? o.methods : []));
    if (base.length) for (const m of [...SYSTEM, ...LOCAL]) {
      if (inOptions.has(m) || out.possible.some(x => x.method === m)) continue;
      const reasons = [];
      if (SYSTEM.includes(m)) for (const f of gate(m, p, base.length).fail) reasons.push(f.reason);
      const bad = base.filter(s => !capTable[s.id][m].ok);
      for (const s of bad.slice(0, 2)) reasons.push(capTable[s.id][m].reason);
      if (!reasons.length && dropped[m]) reasons.push(dropped[m]);
      if (!reasons.length) reasons.push('Подходит только в комбинации с другими методами.');
      if (reasons.length) out.whyNot.push({ method: m, title: SYSTEM.includes(m) ? TITLES[m] : 'Только ' + TITLES[m], reasons: [...new Set(reasons)] });
    }
    return out;
  }


  /* ---------- Режим «Я знаю протокол»: проверка выбранного протокола ---------- */
  const LOCAL_HINT = { RF: 'с пульта или панели, в общие сцены не войдёт', TRIAC: 'с роторной панели, только яркость', SWITCH: 'обычным выключателем, только вкл/выкл' };
  const FEAT_NAME = { dim: 'яркости', cct: 'оттенка белого', rgb: 'цвета', fx: 'эффектов' };
  const FEAT_KEEP = { dim: 'яркость', cct: 'оттенок белого', rgb: 'цвет', fx: 'эффекты' };
  const REPLACE = {
    strip_rgbcct: ['strip_rgbw', 'Цвет плюс отдельный белый канал, без регулировки оттенка белого.'],
    led_fixed: ['led_repl', 'Светильник, у которого драйвер можно заменить на управляемый.']
  };
  function zoneHow(m, s) {
    const k = kindOf(s) || {}, n = needs(s), dim = n.dim || n.cct || n.rgb, color = n.cct || n.rgb || ['strip_cct', 'strip_rgb', 'strip_rgbw'].includes(s.kind);
    if (m === 'SWITCH') return 'Обычный выключатель';
    if (m === 'RF') return 'Контроллер RF ' + RF_NAME[rfMode(s)] + ' с пульта или панели';
    if (m === 'TRIAC') return 'Роторная панель TRIAC' + (s.kind === 'led_repl' && n.dim ? ', драйвер меняется на TRIAC' : '') + (k.cv ? ', диммируемый блок питания или контроллер TRIAC' : '') + (['lamp', 'track230'].includes(s.kind) && n.dim ? '. Лампы и светильники должны быть диммируемыми' : '');
    if (m === 'DALI') {
      if (k.v230) return dim ? 'Яркость — диммер DALI DT6 TRIAC' : 'Вкл / выкл — релейный модуль DALI';
      if (s.kind === 'led_repl') return 'Драйвер меняется на DALI ' + (n.cct ? 'DT8' : 'DT6');
      if (s.kind === 'track48') return 'Магнитная трековая система Exility DALI 48 В';
      return color ? 'DALI DT8: блок питания или контроллер' : 'DALI DT6: блок питания или диммер';
    }
    if (m === 'ZIGBEE') {
      if (k.v230) return dim ? 'ZigBee-диммер' : 'ZigBee-выключатель';
      if (s.kind === 'led_repl') return 'Драйвер меняется на ZigBee';
      if (s.kind === 'track48') return 'Магнитная трековая система Exility ZigBee 48 В';
      return 'Контроллер ZigBee';
    }
    if (m === 'WIFI') {
      if (s.kind === 'lamp' && (n.cct || n.rgb)) return 'Wi-Fi-лампы RGB+MIX';
      if (s.kind === 'lamp' && n.dim) return 'Wi-Fi-диммер с диммируемыми лампами или Wi-Fi-лампы';
      if (k.v230 || ['track48', 'led_repl'].includes(s.kind)) return dim ? 'Wi-Fi-диммер' + (s.kind === 'led_repl' ? ' и драйвер TRIAC' : '') : 'Wi-Fi-выключатель';
      return 'Контроллер Wi-Fi';
    }
    return TITLES[m];
  }
  function zoneChoices(proto, s) {
    const out = [], f = (s.features || []).filter(x => x !== 'unknown' && x !== 'onoff');
    for (const m of localPreference(s, ['RF', 'TRIAC', 'SWITCH'])) {
      if (m !== proto && capability(m, s).ok) out.push({ type: 'local', value: m, label: 'Управлять по ' + TITLES[m], hint: LOCAL_HINT[m].replace(/^./, c => c.toUpperCase()) + '. Итог: ' + TITLES[proto] + ' + ' + TITLES[m] + '.' });
      if (out.length >= 2) break;
    }
    const r = REPLACE[s.kind];
    if (r && capability(proto, Object.assign({}, s, { kind: r[0], features: s.features.filter(x => KINDS[r[0]].feats.includes(x)) })).ok)
      out.push({ type: 'replace', value: r[0], label: 'Заменить на: ' + KINDS[r[0]].label, hint: r[1] + ' Всё остаётся на ' + TITLES[proto] + '.' });
    if (['lamp', 'track230'].includes(s.kind) && s.phaseDim === 'no' && capability(proto, Object.assign({}, s, { phaseDim: 'yes' })).ok)
      out.push({ type: 'phase', value: 'yes', label: 'Заменить лампы на диммируемые', hint: 'С поддержкой диммирования TRIAC — тогда ' + TITLES[proto] + ' регулирует яркость.' });
    const order = ['rgb', 'cct', 'fx', 'dim'];
    let best = null;
    for (let drop = 1; drop <= f.length && !best; drop++) {
      const tries = [];
      const rec = (start, picked) => { if (picked.length === drop) { tries.push(picked); return; } for (let i = start; i < order.length; i++) if (f.includes(order[i])) rec(i + 1, [...picked, order[i]]); };
      rec(0, []);
      for (const d of tries) { const nf = s.features.filter(x => !d.includes(x)); if (capability(proto, Object.assign({}, s, { features: nf.length ? nf : ['onoff'] })).ok) { best = { d, nf: nf.length ? nf : ['onoff'] }; break; } }
    }
    if (best) out.push({ type: 'drop', value: best.nf, label: 'Отказаться от ' + best.d.map(x => FEAT_NAME[x]).join(' и '), hint: 'Останется: ' + (best.nf.filter(x => x !== 'onoff').map(x => FEAT_KEEP[x]).join(', ') || 'только включение и выключение') + '. Всё остаётся на ' + TITLES[proto] + '.' });
    return out;
  }
  function check(p, proto) {
    p = normP(p);
    const sources = p.sources || [], fixes = p.zoneFix || {};
    const base = sources.filter(s => kindOf(s) && !kindOf(s).spi), spi = sources.filter(s => kindOf(s) && kindOf(s).spi);
    const ctl = controlsInfo(p), title = TITLES[proto];
    const res = { proto, title, blocks: [], oks: [], pendings: [], warnings: [], infos: [], zones: [], ready: false, option: null };
    if (proto === 'ZIGBEE' || proto === 'WIFI') {
      if (p.internet === 'no') res.blocks.push({ reason: 'На объекте нет стабильного интернета, а настройка ' + title + ' идёт через облако.', actions: [{ id: 'internet-yes', label: 'Интернет будет' }] });
      else if (p.internet === 'yes') res.oks.push({ text: 'Стабильный интернет есть', hint: 'Нужен для настройки и управления из приложения.' });
      else res.pendings.push({ text: 'Подтвердите стабильный интернет', hint: 'Без него ' + title + ' не настроить.', action: { id: 'internet-yes', label: 'Интернет будет' } });
      if (proto === 'ZIGBEE') res.infos.push({ text: 'ZigBee-хаб', hint: 'Один на весь объект — добавим в комплект.' });
      if (proto === 'WIFI' && base.length > 10) res.warnings.push({ text: 'Больше 10 зон на Wi-Fi', hint: 'Это большая нагрузка на домашнюю сеть. Для такого объекта лучше ZigBee — продолжить с Wi-Fi можно.' });
    }
    if (proto === 'DALI') {
      if (p.bus === 'existing') res.oks.push({ text: 'Линия управления DALI уже проложена', hint: '' });
      else if (p.stage === 'finished' || p.bus === 'no') res.blocks.push({ reason: p.bus === 'no' && p.stage !== 'finished' ? 'Прокладка линии управления DALI исключена, а без неё DALI не работает.' : 'Отделка завершена, а линии управления DALI нет. Проложить её без вскрытия отделки не получится.', actions: [{ id: 'bus-existing', label: 'Шина всё-таки есть' }] });
      else if (p.stage === 'before' && p.bus === 'approved') res.oks.push({ text: 'Линию управления проложат вместе с электрикой', hint: 'Чистовая отделка ещё не сделана.' });
      else res.pendings.push({ text: 'Подтвердите, что линию управления можно проложить', hint: 'DALI нужна отдельная двухпроводная линия (шина). Подбор продолжится, но перед закупкой это нужно проверить.', action: { id: 'bus-approved', label: 'Шину проложим' } });
      if (p.object === 'room' || (p.rooms || []).length === 1) res.warnings.push({ text: 'Для одного помещения DALI обычно избыточен', hint: 'Maytoni рекомендует DALI для квартир, домов и коммерческих объектов. Это рекомендация, а не запрет — продолжить можно.' });
      const via = [ctl.digital ? 'смартфон и голос' : '', ctl.remote ? 'RF-пульт' : ''].filter(Boolean);
      if (via.length) res.infos.push({ text: via.join(' и ').replace(/^./, c => c.toUpperCase()), hint: 'Через конвертер Wi-Fi / RF – DALI 721005 — добавим его в комплект.' });
    }
    if (false && ['TRIAC', 'RF'].includes(proto) && (p.rooms || []).some(r => r.motion)) res.warnings.push({ text: 'Датчики движения', hint: 'Для ' + title + ' включение по движению в этом подборе не предусмотрено — отметки в помещениях не учитываются.' });
    if (proto === 'RF' && (p.extras || []).includes('scenes') && p.scenes === '5+') res.warnings.push({ text: 'Больше 4 сцен', hint: 'Пульт RF хранит до 4 сцен. Для большего числа понадобятся отдельные контроллеры с пультами по зонам.' });
    const assign = {}, methods = [proto];
    for (const s of base) {
      const c = capability(proto, s), z = { id: s.id, roomId: s.roomId, name: srcName(s), pending: c.pending };
      if (c.ok) { assign[s.id] = proto; z.status = 'ok'; z.how = zoneHow(proto, s); }
      else if (fixes[s.id] && fixes[s.id] !== proto && capability(fixes[s.id], s).ok) { assign[s.id] = fixes[s.id]; if (!methods.includes(fixes[s.id])) methods.push(fixes[s.id]); z.status = 'fixed'; z.method = fixes[s.id]; z.how = 'По ' + TITLES[fixes[s.id]] + ': ' + zoneHow(fixes[s.id], s).replace(/^./, c => c.toLowerCase()); z.reason = c.reason; }
      else { z.status = 'decide'; z.reason = c.reason; z.choices = zoneChoices(proto, s); }
      res.zones.push(z);
    }
    for (const s of spi) res.zones.push({ id: s.id, roomId: s.roomId, name: srcName(s), status: 'spi', how: proto === 'WIFI' || (!base.length && s.spiControl === 'phone') ? 'Контроллер Wi-Fi–SPI, управление из того же приложения' : 'Отдельный SPI-контроллер с собственным пультом', pending: [] });
    res.ready = !res.blocks.length && !res.zones.some(z => z.status === 'decide') && sources.some(s => kindOf(s));
    const ms = base.length ? methods : ['SPI'];
    res.option = { methods: ms, assign, title: ms.map((m, i) => m === 'SWITCH' && i > 0 ? 'обычный выключатель' : TITLES[m]).join(' + '), caveats: [], pending: [], cons: [], pros: [], kind: ms.length > 1 ? 'hybrid' : 'single', label: 'recommended' };
    return res;
  }

  /* ---------- Подбор оборудования ---------- */
  const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many;
  const fmt = x => x === null || x === undefined ? 'не указано' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(x);
  function ipFilter(cand, wet, notes) {
    if (!cand.some(s => CATALOG[s].ip)) return cand;
    if (wet === 'yes') {
      const w = cand.filter(s => (CATALOG[s].ip || 0) >= 65);
      if (w.length) return w;
      notes.push('Исполнения IP65 и выше нет — установите устройство вне влажной зоны.');
      return cand;
    }
    const dry = cand.filter(s => (CATALOG[s].ip || 20) < 65);
    return dry.length ? dry : cand;
  }
  function byLoad(list, v, load, k = RESERVE, label, wet) {
    const pending = [], notes = [];
    let cand = list.filter(sku => !CATALOG[sku].volts || v === null || CATALOG[sku].volts[v] !== undefined);
    if (v === null && list.some(s => CATALOG[s].volts)) pending.push('Укажите напряжение');
    if (!cand.length) return { skus: [], qty: 0, issue: 'Нет устройства на ' + v + ' В в ассортименте', pending };
    cand = ipFilter(cand, wet, notes);
    const lim = sku => { const c = CATALOG[sku]; return c.volts ? (v !== null ? c.volts[v] : Math.max(...Object.values(c.volts))) : c.perCh; };
    if (load === null) { pending.push('Укажите мощность зоны — подберём одно устройство'); return { skus: cand, qty: 1, pending }; }
    const need = load * k;
    const fit = cand.filter(s => lim(s) >= need).sort((a, b) => lim(a) - lim(b));
    notes.push('Нагрузка с запасом 30%: ' + fmt(need) + ' Вт');
    if (fit.length) { const best = lim(fit[0]); return { skus: fit.filter(s => lim(s) === best), qty: 1, pending, notes }; }
    const max = cand.reduce((a, s) => lim(s) > lim(a) ? s : a, cand[0]);
    const parts = Math.ceil(need / lim(max));
    notes.push('Нагрузка ' + fmt(need) + ' Вт больше ' + lim(max) + ' Вт — разделите ' + (label || 'участок') + ' на ' + parts + ' ' + plural(parts, 'часть', 'части', 'частей') + ' и поставьте ' + parts + ' ' + plural(parts, 'устройство', 'устройства', 'устройств') + '.');
    return { skus: cand.filter(s => lim(s) === lim(max)), qty: parts, pending, notes };
  }
  function pickDriver(list, s) {
    const c = num(s.current), per = Math.max(1, num(s.driversPer) || 1);
    const pw = num(s.unitPower) !== null ? num(s.unitPower) / per : null;
    const units = num(s.units), qty = units ? units * per : 1;
    const lv = (() => { const m = String(s.ledV || '').replace(',', '.').match(/(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/); if (!m) return null; const a = Number(m[1]), b = m[2] ? Number(m[2]) : a; return a > 0 ? [Math.min(a, b), Math.max(a, b)] : null; })();
    if (c === null) return { skus: list.slice(0, 3), qty, notes: [], pending: ['Укажите рабочий ток светильника, мА — он указан на драйвере или в паспорте'] };
    const fit = []; let volBlocked = false;
    for (const sku of list) {
      const d = CATALOG[sku];
      if (c < d.current[0] || c > d.current[1]) continue;
      if (lv && d.vout && (lv[0] < d.vout[0] || lv[1] > d.vout[1])) { volBlocked = true; continue; }
      if (pw !== null && d.power && (pw < d.power[0] || pw > d.power[1])) continue;
      let set = null;
      if (d.steps) { const st = d.steps.filter(x => x <= c); if (!st.length) continue; set = Math.max(...st); }
      fit.push({ sku, set, nfc: !!d.nfc });
    }
    if (!fit.length && volBlocked) return { skus: [], qty: 0, notes: [], pending: [], issue: 'Драйвера с подходящим напряжением (' + lv.join('–') + ' В) в ассортименте нет — уточните у специалиста Maytoni.' };
    if (!fit.length) return { skus: [], qty: 0, notes: [], pending: [], issue: 'Нет драйвера на ' + fmt(c) + ' мА' + (pw !== null ? ' и ' + fmt(pw) + ' Вт' : '') + ' в ассортименте' };
    const fN = fit.filter(f => f.nfc), fS = fit.filter(f => !f.nfc);
    const top = fS.length && fN.length ? [...fN.slice(0, 2), fS[0]] : fit.slice(0, 3), notes = [];
    const nf = top.filter(f => f.nfc), st = top.filter(f => !f.nfc);
    if (nf.length) notes.push((nf.length < top.length ? nf.map(f => f.sku).join(', ') + ': ток' : 'Ток') + ' выставляется через NFC — установите ' + c + ' мА.');
    for (const f of st) notes.push(f.sku + ': установите ступень ' + f.set + ' мА' + (f.set < c ? ' — ближайшую не выше тока светильника' : '') + '.');
    if (!lv) { const rs = [...new Set(top.map(f => CATALOG[f.sku].vout).filter(Boolean).map(r => r.join('–')))]; if (rs.length) notes.push('Проверьте, что напряжение светильника входит в диапазон драйвера: ' + rs.join(' или ') + ' В.'); }
    notes.push('По одному драйверу на светильник' + (per > 1 ? ' (в светильнике ' + per + ' ' + plural(per, 'драйвер', 'драйвера', 'драйверов') + ')' : '') + '.');
    return { skus: top.map(f => f.sku), qty, notes, pending: units ? [] : ['Укажите количество светильников — по драйверу на каждый'] };
  }
  function byCurrent(list, current) {
    const c = num(current);
    if (c === null) return { skus: list, qty: 1, pending: ['Уточните рабочий ток светильника, мА — сверьте с паспортом'] };
    const fit = list.filter(s => CATALOG[s].current[0] <= c && c <= CATALOG[s].current[1]);
    return fit.length ? { skus: fit, qty: 1, pending: [] } : { skus: [], qty: 0, issue: 'Нет драйвера на ток ' + c + ' мА', pending: [] };
  }
  /* Упаковка зон по каналам: 1 канал = 1 зона. Возвращает список устройств. */
  function packChannels(list, zones, k, opts = {}) {
    const issues = [], pending = [], devices = [];
    let pool = list.filter(sku => !opts.noNeutral || CATALOG[sku].noNeutral);
    if (opts.noNeutral) pending.push('Нет нейтрали — подходят только выключатели MSN001 / MSN002');
    if (zones.some(z => z.load === null)) pending.push('Уточните мощность зон: ' + zones.filter(z => z.load === null).map(z => z.name).join(', '));
    let left = zones.slice().sort((a, b) => (b.load || 0) - (a.load || 0));
    const fits = (sku, zs) => { const c = CATALOG[sku]; const sum = zs.reduce((a, z) => a + (z.load || 0) * k, 0); return zs.length <= c.ch && zs.every(z => (z.load || 0) * k <= c.perCh) && (!c.total || sum <= c.total); };
    while (left.length) {
      const sorted = pool.slice().sort((a, b) => CATALOG[a].ch - CATALOG[b].ch || CATALOG[a].perCh - CATALOG[b].perCh);
      let pick = sorted.find(sku => CATALOG[sku].ch >= left.length && fits(sku, left));
      let take = left.length;
      if (!pick) {
        for (const sku of sorted.slice().sort((a, b) => CATALOG[b].ch - CATALOG[a].ch)) {
          for (let t = Math.min(CATALOG[sku].ch, left.length); t >= 1; t--) { if (fits(sku, left.slice(0, t))) { pick = sku; take = t; break; } }
          if (pick) break;
        }
      }
      if (!pick) { const z = left.shift(); issues.push(z.name + ': мощность зоны больше допустимой для одного канала — разделите зону.'); continue; }
      const zs = left.slice(0, take); left = left.slice(take);
      const same = pool.filter(s => CATALOG[s].ch === CATALOG[pick].ch && fits(s, zs));
      devices.push({ skus: same, zones: zs.map(z => z.name), ch: CATALOG[pick].ch });
    }
    return { devices, issues, pending };
  }

  /* Многоканальные контроллеры (предел на канал): одноцветную ленту можно разделить на участки по каналам,
     у цветной ленты нагрузка делится между её цветовыми каналами. */
  const MODE_CH = { DIM: 1, CCT: 2, RGB: 3, RGBW: 4, RGBCCT: 5 };
  function byCV(list, s) {
    const v = voltageOf(s), load = loadOf(s), mode = rfMode(s), nCh = MODE_CH[mode], mono = mode === 'DIM';
    const pending = [], notes = [];
    let cand = list.filter(sku => v === null || CATALOG[sku].volts[v] !== undefined);
    if (v === null) pending.push('Укажите напряжение');
    if (!cand.length) return { skus: [], qty: 0, issue: 'Нет контроллера на ' + v + ' В в ассортименте', pending };
    const perCh = sku => { const c = CATALOG[sku]; return v !== null ? c.volts[v] : Math.max(...Object.values(c.volts)); };
    const cap = sku => { const c = CATALOG[sku]; return c.perChV ? perCh(sku) * (mono ? c.ch : nCh) : perCh(sku); };
    if (load === null) { pending.push('Укажите мощность зоны — подберём одно устройство'); return { skus: cand, qty: 1, pending }; }
    const need = load * RESERVE;
    notes.push('Нагрузка с запасом 30%: ' + fmt(need) + ' Вт');
    const fit = cand.filter(s2 => cap(s2) >= need).sort((a, b) => cap(a) - cap(b));
    let skus, qty = 1, ref;
    if (fit.length) { ref = fit[0]; skus = fit.filter(s2 => cap(s2) === cap(ref)); }
    else { ref = cand.reduce((a, b) => cap(b) > cap(a) ? b : a, cand[0]); qty = Math.ceil(need / cap(ref)); skus = [ref]; notes.push('Один контроллер не потянет нагрузку — разделите участок на ' + qty + ' ' + plural(qty, 'часть', 'части', 'частей') + ' и поставьте ' + qty + ' ' + plural(qty, 'контроллер', 'контроллера', 'контроллеров') + '.'); }
    if (CATALOG[ref].perChV && mono) { const segs = Math.ceil(need / qty / perCh(ref)); if (segs > 1) notes.push('Разделите ленту на ' + segs + ' ' + plural(segs, 'участок', 'участка', 'участков') + ' по каналам контроллера.'); }
    return { skus, qty, pending, notes };
  }
  /* Обычный блок питания: по одному подходящему артикулу из каждой серии, до трёх вариантов */
  function pickPSU(v, load, wet, label) {
    const notes = [], pending = [];
    if (v === null) return { skus: [], qty: 1, notes, pending: ['Уточните напряжение — подберём блок питания'], generic: true, plain: true };
    let cand = KIT.psu.filter(s => CATALOG[s].volts[v] !== undefined);
    if (!cand.length) return { skus: [], qty: 1, notes, pending: [], issue: 'Блоков питания на ' + v + ' В в прайсе нет' };
    cand = ipFilter(cand, wet, notes);
    if (load === null) return { skus: [], qty: 1, notes, pending: ['Уточните мощность участка — подберём блок с запасом 30%'], generic: true, plain: true };
    const W = s => CATALOG[s].volts[v], need = load * RESERVE;
    const rank = (a, b) => CATALOG[a].pr - CATALOG[b].pr || W(a) - W(b) || CATALOG[a].series.localeCompare(CATALOG[b].series);
    const bySeries = {};
    for (const s of cand) { const ser = CATALOG[s].series; if (W(s) >= need && (!bySeries[ser] || W(s) < W(bySeries[ser]))) bySeries[ser] = s; }
    let pick = Object.values(bySeries).sort(rank).slice(0, 3), qty = 1;
    notes.push('Нагрузка с запасом 30%: ' + fmt(need) + ' Вт');
    if (!pick.length) {
      const maxW = Math.max(...cand.map(W)); qty = Math.ceil(need / maxW);
      pick = cand.filter(s => W(s) === maxW).sort(rank).slice(0, 3);
      notes.push('Один блок не потянет нагрузку — разделите ' + (label || 'участок') + ' на ' + qty + ' ' + plural(qty, 'часть', 'части', 'частей') + ', по блоку на каждую.');
    }
    notes.push('Варианты: ' + pick.map(s => CATALOG[s].series + ' ' + W(s) + ' Вт, IP' + CATALOG[s].ip).join('; ') + '.');
    return { skus: pick, qty, notes, pending };
  }
  function item(type, sel, extra = {}) {
    return Object.assign({ type, skus: sel ? sel.skus : [], qty: sel ? (sel.qty || 1) : (extra.qty || 1), notes: sel && sel.notes ? sel.notes.slice() : [], pending: sel ? (sel.pending || []).slice() : [], issue: sel ? sel.issue || null : null, generic: !!(sel && sel.generic), plain: !!(sel && sel.plain), link: sel && sel.link || null, maytoni: !!(sel && sel.maytoni) }, extra);
  }
  const generic = (type, note, qty) => ({ type, skus: [], qty: qty || 1, notes: note ? [note] : [], pending: [], issue: null, generic: true });
  const rfMode = s => { const n = needs(s); return s.kind === 'strip_rgbcct' ? 'RGBCCT' : s.kind === 'strip_rgbw' ? 'RGBW' : (s.kind === 'strip_rgb' || n.rgb) ? 'RGB' : (s.kind === 'strip_cct' || n.cct) ? 'CCT' : 'DIM'; };
  const RF_LIST = { DIM: 'rfDim', CCT: 'rfCCT', RGB: 'rfRGB', RGBW: 'rfRGBW', RGBCCT: 'rfRGBCCT' };
  const RF_NAME = { DIM: 'DIM', CCT: 'MIX', RGB: 'RGB', RGBW: 'RGBW', RGBCCT: 'RGB+MIX' };

  const plainType = (title, note) => ({ type: title, skus: [], qty: 1, notes: note ? [note] : [], pending: [], issue: null, generic: true, plain: true });
  const maytoniSystem = (title, note) => ({ type: title, skus: [], qty: 1, notes: [note || 'Система Maytoni. Шинопровод, светильники и блоки питания подбираются по каталогу системы.'], pending: [], issue: null, system: true });
  const realItems = list => list.filter(i => !['Уточнить', 'Внимание'].includes(i.type));

  function buildEquipment(p, option) {
    p = normP(p);
    const ctl = controlsInfo(p);
    const rooms = (p.rooms || []).map(r => ({ id: r.id, name: r.name, motion: false, zones: [], roomItems: [] })); // датчики движения отключены до появления новинок
    const roomOf = id => rooms.find(r => r.id === id) || rooms[0];
    const project = [];
    const methods = new Set(option.methods);
    const n = s => needs(s);
    const psu = s => s.kind === 'track48' ? null : item('Блок питания ' + (voltageOf(s) ? voltageOf(s) + ' В' : ''), pickPSU(voltageOf(s), loadOf(s), s.kind === 'track24' ? 'no' : s.wet, 'участок'));
    const push = (arr, it) => { if (it) arr.push(it); };
    const relayZones = [], wifiSw = {}, wifiDim = {};
    const dali = { zones: [], relayAddr: 0 };

    if (methods.has('ZIGBEE')) {
      project.push(item('ZigBee-хаб', { skus: KIT.zigHub, qty: 1, notes: ['В типовой схеме — один на объект.'] }));
      if (ctl.remote) project.push(generic('Пульт ZigBee'));
    }
    if (option.methods[0] === 'WIFI' && ctl.wall) project.push(generic('Настенная клавиша для Wi-Fi-устройств', 'По желанию — дублирует управление из приложения.'));

    for (const s of (p.sources || [])) {
      const room = roomOf(s.roomId); const k = kindOf(s); if (!k) continue;
      const zone = { id: s.id, roomId: room.id, name: s.name || (s._label || srcName(s)), named: !!s.name, kind: (s._label || k.label) + (s.stripSku ? ' · ' + s.stripSku : ''), load: loadOf(s), voltage: voltageOf(s), method: null, methodKey: null, items: [], variants: [], notes: [], pending: [] };
      room.zones.push(zone);
      const sf = s.stripSku && STRIPS[s.stripSku] && STRIPS[s.stripSku].flag;
      if (sf === 'dtw') zone.notes.push('Dim to Warm: при уменьшении яркости свет становится теплее (до 1800K) — нужен обычный диммер.');
      if (s.kind === 'strip_nc') zone.notes.push('Лента не управляется контроллерами: цветовая температура переключается на самой ленте. Включение и выключение — по сети 230 В перед блоком питания.');
      const sv = voltageOf(s), sl = num(s.length), maxL = { 12: 5, 24: 10, 48: 20 }[sv];
      if (s.kind && s.kind.startsWith('strip_') && sl && maxL && sl > maxL) zone.notes.push('Участок длиннее ' + maxL + ' м при ' + sv + ' В: подведите питание с двух сторон или используйте параллельное подключение.');
      if (s.wet === 'yes' && s.kind !== 'track24') zone.notes.push('Влажная зона: блоки питания подобраны с IP65 и выше. Контроллеры и приборы IP20 устанавливайте вне влажной зоны.');
      if (k.spi) {
        const viaWifi = methods.has('WIFI') || (!(option.methods.some(m => m !== 'SPI')) && s.spiControl === 'phone');
        zone.method = viaWifi ? 'Wi-Fi + SPI' : 'SPI'; zone.methodKey = 'SPI';
        const spiSel = byLoad(viaWifi ? KIT.wifiSPI : KIT.spi, zone.voltage, zone.load, RESERVE, 'ленту');
        if ((spiSel.skus || []).includes('711009')) (spiSel.notes = spiSel.notes || []).push('711009: два независимых выхода — до двух участков с разными эффектами.');
        zone.items.push(item(viaWifi ? 'Контроллер Wi-Fi–SPI' : 'SPI-контроллер', spiSel));
        if (!viaWifi) zone.items.push(item('Пульт SPI', { skus: KIT.spiRemote, qty: 1 }));
        if (s.sync === 'yes') zone.items.push(item('SPI-усилитель для синхронных участков', { skus: KIT.spiAmp, qty: 1, notes: ['711007 — 6 каналов, 711011 — 2 канала.'] }));
        push(zone.items, psu(s));
        if (viaWifi && p.internet !== 'yes') zone.pending.push('Для Wi-Fi–SPI нужен стабильный интернет.');
        continue;
      }
      const m = option.assign[s.id]; zone.method = TITLES[m]; zone.methodKey = m;
      const nd = n(s);
      const dim = nd.dim || nd.cct || nd.rgb;
      if (s.kind === 'strip_nc') {
        if (m === 'WIFI') { (wifiSw[room.id] = wifiSw[room.id] || []).push({ name: zone.name, load: zone.load, neutral: s.neutral }); zone.items.push(generic('Канал Wi-Fi-выключателя', 'По сети 230 В перед блоком питания. Устройство подобрано для помещения целиком.')); }
        else if (m === 'ZIGBEE') zone.items.push(generic('ZigBee-выключатель', 'По сети 230 В перед блоком питания. В ассортименте Maytoni нет — подбирается совместимый с хабом.'));
        else if (m === 'DALI') { relayZones.push({ name: zone.name, load: zone.load }); zone.items.push(generic('Канал релейного модуля DALI', 'По сети 230 В перед блоком питания.')); dali.zones.push({ id: zone.id, roomId: room.id, name: zone.name, addr: 0 }); }
        else zone.items.push(generic('Обычный настенный выключатель', 'Перед блоком питания.'));
        push(zone.items, psu(s));
        continue;
      }
      if (s.kind === 'track24') zone.items.push(maytoniSystem('Например, магнитная трековая система Flarity 24 В', 'Система Maytoni. Шинопровод и светильники подбираются по каталогу системы; блок питания — ниже.'));
      if (m === 'SWITCH') { zone.items.push(generic('Обычный настенный выключатель')); if (k.cv) push(zone.items, psu(s)); if (s.kind === 'track48') zone.items.push(plainType('Трековая система 48 В', 'Блок питания подбирается по выбранной системе.')); }
      if (m === 'TRIAC') {
        const panel = byLoad(KIT.triacPanel, null, zone.load, PHASE_K, 'зону');
        zone.items.push(item('Роторная панель TRIAC — одна на зону', panel));
        if (s.kind === 'lamp' && nd.dim) zone.items.push(generic('Диммируемые лампы с поддержкой TRIAC'));
        if (s.kind === 'track230' && nd.dim) zone.items.push({ type: 'Трековая система Unity 230 В со светильниками TRIAC', excelType: 'Трековые светильники Unity с диммированием TRIAC', skus: KIT.unity.slice(), qty: 1, notes: ['Например, светильники с диммированием TRIAC — регулируются роторной панелью. Светильники без поддержки TRIAC на таком треке будут только включаться и выключаться.'], pending: [], issue: null, maytoni: true });
        if (s.kind === 'led_repl' && nd.dim) zone.items.push(item('Драйвер TRIAC — заменяет штатный', pickDriver(KIT.triacDriver, s)));
        if (k.cv) {
          if (zone.voltage === 24 || zone.voltage === null) zone.variants.push({ title: 'Вариант 1 — диммируемый блок питания', items: [item('Источник напряжения 24 В с диммированием TRIAC', byLoad(KIT.triacPSU, 24, zone.load, RESERVE, 'участок', s.kind === 'track24' ? 'no' : s.wet))] });
          zone.variants.push({ title: (zone.voltage === 24 || zone.voltage === null ? 'Вариант 2' : 'Вариант 1') + ' — контроллер TRIAC', items: [item('Контроллер TRIAC', byLoad(KIT.triacCV, zone.voltage, zone.load)), psu(s)].filter(Boolean) });
        }
        if (ctl.remote) zone.items.push(item('Пульт RF DIM для панели', { skus: KIT.rfRemote.DIM, qty: panel.qty || 1, notes: ['Работает только в паре с панелью TRIAC: синхронизируется с ней. Один пульт — одна панель.'] }));
      }
      if (m === 'RF') {
        const mode = rfMode(s);
        zone.items.push(item('Контроллер RF ' + RF_NAME[mode], byLoad(KIT[RF_LIST[mode]], zone.voltage, zone.load)));
        push(zone.items, psu(s));
        zone.rfMode = mode;
      }
      if (m === 'WIFI' && s.kind === 'lamp' && (nd.cct || nd.rgb)) {
        const u = num(s.units);
        zone.items.push(plainType('Wi-Fi-лампа RGB+MIX', 'Подбирается по цоколю светильника. Настенный выключатель должен оставаться включённым — управление идёт из приложения.'));
        zone.items[zone.items.length - 1].qty = u || 1;
        if (!u) zone.items[zone.items.length - 1].pending.push('Укажите количество ламп');
      } else if (m === 'WIFI' && s.kind === 'lamp' && nd.dim) {
        const u = num(s.units);
        (wifiDim[room.id] = wifiDim[room.id] || []).push({ name: zone.name, load: zone.load, variant: true });
        zone.variants.push({ title: 'Вариант 1 — Wi-Fi-диммер', items: [generic('Канал Wi-Fi-диммера', 'Устройство подобрано для помещения целиком — см. «Управление в помещении».'), generic('Диммируемые лампы с поддержкой TRIAC')] });
        const lamp = Object.assign(plainType('Wi-Fi-лампа диммируемая', 'Подбирается по цоколю светильника. Настенный выключатель должен оставаться включённым — управление идёт из приложения.'), { qty: u || 1 });
        if (!u) lamp.pending.push('Укажите количество ламп');
        zone.variants.push({ title: 'Вариант 2 — Wi-Fi-лампы', items: [lamp] });
      } else if (m === 'WIFI') {
        if (k.v230 || s.kind === 'track48' || s.kind === 'led_repl') {
          if (!dim) (wifiSw[room.id] = wifiSw[room.id] || []).push({ name: zone.name, load: zone.load, neutral: s.neutral });
          else { (wifiDim[room.id] = wifiDim[room.id] || []).push({ name: zone.name, load: zone.load }); if (s.kind === 'led_repl') zone.items.push(item('Драйвер TRIAC — заменяет штатный, если он не диммируется', pickDriver(KIT.triacDriver, s))); }
          zone.items.push(generic(dim ? 'Канал Wi-Fi-диммера' : 'Канал Wi-Fi-выключателя', 'Устройство подобрано для помещения целиком — см. «Управление в помещении».'));
          if (s.kind === 'track48') zone.items.push(plainType('Трековая система 48 В', 'Блок питания подбирается по выбранной системе.'));
        } else { zone.items.push(item('Контроллер Wi-Fi', byCV(KIT.wifiCV, s))); push(zone.items, psu(s)); }
      }
      if (m === 'ZIGBEE') {
        if (k.v230) zone.items.push(generic(dim ? 'ZigBee-диммер с фазовым управлением' : 'ZigBee-выключатель', 'В ассортименте Maytoni нет — подбирается совместимый с хабом.'));
        else if (s.kind === 'led_repl') zone.items.push(item('Драйвер ZigBee — заменяет штатный', pickDriver(KIT.zigDriver, s)));
        else if (s.kind === 'track48') zone.items.push(maytoniSystem('Магнитная трековая система Exility ZigBee 48 В'));
        else { zone.items.push(item('Контроллер ZigBee', byCV(KIT.zigCV, s))); push(zone.items, psu(s)); }
      }
      if (m === 'DALI') {
        let addr = null;
        if (k.v230 && !dim) { relayZones.push({ name: zone.name, load: zone.load }); zone.items.push(generic('Канал релейного модуля DALI', 'Модули подобраны на весь объект.')); addr = 0; }
        else if (k.v230) { const sel = byLoad(KIT.daliPhase, null, zone.load, PHASE_K, 'зону'); zone.items.push(item('Диммер DALI DT6 TRIAC', sel)); addr = sel.qty || 1; }
        else if (s.kind === 'led_repl') { const sel = pickDriver(nd.cct ? KIT.daliDT8 : KIT.daliDT6, s); zone.items.push(item(nd.cct ? 'Драйвер DALI DT8 — заменяет штатный' : 'Драйвер DALI DT6 — заменяет штатный', sel)); addr = num(s.units) ? sel.qty || num(s.units) : null; }
        else if (s.kind === 'track48') { zone.items.push(maytoniSystem('Магнитная трековая система Exility DALI 48 В')); addr = num(s.units); if (!addr) zone.pending.push('Укажите количество светильников на треке — у каждого свой адрес DALI.'); }
        else {
          const color = nd.cct || nd.rgb || ['strip_cct', 'strip_rgb', 'strip_rgbw'].includes(s.kind);
          const rgb = nd.rgb || ['strip_rgb', 'strip_rgbw'].includes(s.kind);
          if (!rgb && (zone.voltage === 24 || zone.voltage === null)) zone.variants.push({ title: 'Вариант 1 — управляемый блок питания', items: [item(color ? 'Источник напряжения 24 В DALI DT8' : 'Источник напряжения 24 В DALI DT6', byLoad(color ? KIT.daliPSU8 : KIT.daliPSU6, 24, zone.load, RESERVE, 'участок', s.kind === 'track24' ? 'no' : s.wet))] });
          const cv = byLoad(color ? KIT.daliCV8 : KIT.daliCV6, zone.voltage, zone.load);
          zone.variants.push({ title: 'Вариант ' + (zone.variants.length + 1) + ' — контроллер DALI', items: [item(color ? 'Контроллер DALI DT8' : 'Диммер DALI DT6', cv), psu(s)].filter(Boolean) });
          addr = Math.max(...zone.variants.map(v => v.items[0].qty || 1));
        }
        dali.zones.push({ id: zone.id, roomId: room.id, name: zone.name, addr });
      }
    }
    // Wi-Fi: упаковка зон помещения по каналам; панели и датчики по помещениям
    for (const room of rooms) {
      if (wifiSw[room.id]) {
        const noNeutral = wifiSw[room.id].some(z => z.neutral === 'no');
        const r = packChannels(KIT.wifiSwitch, wifiSw[room.id], RESERVE, { noNeutral });
        for (const d of r.devices) room.roomItems.push(item('Wi-Fi-выключатель, ' + d.ch + ' кан.', { skus: d.skus, qty: 1, notes: ['Зоны: ' + d.zones.join(', ')] }));
        r.issues.forEach(x => room.roomItems.push(Object.assign(generic('Внимание'), { issue: x })));
        if (r.pending.length) room.roomItems.push(Object.assign(generic('Уточнить'), { pending: r.pending }));
        if (wifiSw[room.id].some(z => !z.neutral || z.neutral === 'unknown')) room.roomItems.push(Object.assign(generic('Уточнить'), { pending: ['Есть ли нейтраль в месте установки выключателя? Без неё подходят только MSN001 / MSN002.'] }));
      }
      if (wifiDim[room.id]) {
        const r = packChannels(KIT.wifiDim, wifiDim[room.id], PHASE_K);
        const varNames = wifiDim[room.id].filter(z => z.variant).map(z => z.name);
        for (const d of r.devices) room.roomItems.push(item('Wi-Fi-диммер, ' + d.ch + ' кан.', { skus: d.skus, qty: 1, notes: ['Зоны: ' + d.zones.join(', ') + '.' + (d.zones.some(n => varNames.includes(n)) ? ' Для зон с Wi-Fi-лампами (вариант 2) диммер не нужен.' : '')] }));
        r.issues.forEach(x => room.roomItems.push(Object.assign(generic('Внимание'), { issue: x })));
        if (r.pending.length) room.roomItems.push(Object.assign(generic('Уточнить'), { pending: r.pending }));
      }
      const has = key => room.zones.some(z => z.methodKey === key);
      if (has('ZIGBEE') && ctl.wall) room.roomItems.push(item('Настенная панель ZigBee', { skus: KIT.zigPanel, qty: 1, notes: ['DRC035-Z-8-W — белая, DRC035-Z-8-B — чёрная.'] }));
      if (has('DALI') && ctl.wall) {
        const onlyScenes = (p.extras || []).includes('scenes') && p.scenes === '1-4';
        room.roomItems.push(item('Настенная панель DALI', { skus: onlyScenes ? ['721052', ...KIT.daliPanel] : [...KIT.daliPanel, '721052'], qty: 1, notes: [onlyScenes ? 'Например: для вызова до 4 сценариев — 721052; со свободно программируемыми кнопками — 721042 (белая) или 721046 (чёрная).' : 'Например: со свободно программируемыми кнопками — 721042 (белая) или 721046 (чёрная); для вызова до 4 сценариев — 721052.'], link: { href: 'https://maytoni.ru/catalog/upravlenie-osveshcheniem/dali/paneli-upravleniya/', text: 'Больше панелей — в каталоге Maytoni' } }));
      }
      if (room.motion) {
        if (has('DALI')) room.roomItems.push(item('Датчик движения DALI', { skus: KIT.daliSensor, qty: 1, notes: ['727001 — инфракрасный: реагирует на движение людей в зоне прямой видимости, подходит для большинства помещений. 727002 — микроволновый: чувствительнее, срабатывает и на небольшие движения, подходит для скрытой установки.'] }));
        else if (has('ZIGBEE')) room.roomItems.push(generic('Датчик движения ZigBee', 'В ассортименте Maytoni нет — подбирается совместимый с хабом.'));
        else if (has('WIFI')) room.roomItems.push(generic('Датчик движения Wi-Fi', 'В ассортименте Maytoni нет — подбирается совместимый с приложением.'));
      }
      // RF: один пульт / панель на тип ленты в помещении
      const modes = [...new Set(room.zones.filter(z => z.rfMode).map(z => z.rfMode))];
      for (const mode of modes) {
        const names = room.zones.filter(z => z.rfMode === mode).map(z => z.name).join(', ');
        const nCtl = room.zones.filter(z => z.rfMode === mode).reduce((a, z) => a + ((z.items.find(i => /^Контроллер RF/.test(i.type)) || {}).qty || 1), 0);
        if (ctl.remote || !ctl.wall || !KIT.rfPanel[mode].length) room.roomItems.push(item('Пульт RF ' + RF_NAME[mode], { skus: KIT.rfRemote[mode], qty: nCtl, notes: ['Для: ' + names + '. Один пульт — один контроллер, до 4 сцен.' + (nCtl > 1 ? ' Вы можете воспользоваться мультизонным пультом.' : '')] }));
        if (ctl.wall) {
          if (KIT.rfPanel[mode].length) room.roomItems.push(item('Роторная панель RF ' + RF_NAME[mode], { skus: KIT.rfPanel[mode], qty: 1, notes: ['Для: ' + names + '.'] }));
          else room.roomItems.push(Object.assign(generic('Настенная панель RF ' + RF_NAME[mode]), { issue: 'Настенной панели RF ' + RF_NAME[mode] + ' в ассортименте нет — управление с пульта.' }));
        }
      }
    }
    // ZigBee: до 128 устройств на хаб
    if (methods.has('ZIGBEE')) {
      const isDev = i => !i.system && !/^Блок питания|^Диммируемые лампы|^Wi-Fi-лампа|^Канал /.test(i.type);
      let nz = 0;
      for (const r of rooms) {
        for (const z of r.zones) if (z.methodKey === 'ZIGBEE') nz += z.items.filter(isDev).reduce((a, i) => a + (i.qty || 1), 0);
        nz += r.roomItems.filter(i => /ZigBee/.test(i.type)).reduce((a, i) => a + (i.qty || 1), 0);
      }
      const hub = project.find(i => i.type === 'ZigBee-хаб');
      if (hub) { hub.qty = Math.max(1, Math.ceil(nz / 128)); hub.notes = ['До 128 устройств на хаб. Устройств ZigBee в проекте: ' + nz + '.']; }
    }
    // DALI: релейные модули, адреса, линии
    let daliInfo = null;
    if (methods.has('DALI')) {
      let relayModules = 0;
      if (relayZones.length) {
        const sum = relayZones.reduce((a, z) => a + (z.load || 0), 0);
        relayModules = Math.max(Math.ceil(relayZones.length / 4), Math.ceil(sum * RESERVE / 2760));
        const it = item('Релейный модуль DALI, 4 канала', { skus: KIT.daliRelay, qty: relayModules, notes: ['Зон вкл/выкл: ' + relayZones.length + '. В расчёте адресов — 4 адреса на модуль.'] });
        if (relayZones.some(z => z.load === null)) it.pending.push('Уточните мощность зон для проверки лимита 2760 Вт на модуль');
        project.push(it);
      }
      daliInfo = daliPlan(p, rooms, dali.zones, relayModules * 4);
      const lines = daliInfo.mode === 'lines' ? daliInfo.lines.length : 1;
      const smartOnly = ctl.digital && !ctl.wall && !ctl.remote;
      const busNote = 'Со встроенным питанием шины. В типовой схеме, если контроллер остаётся подключённым к шине (устройства DALI-2), отдельный источник питания не нужен. Источник 16 В (721009 или 721012) понадобится, если на шине нет мастер-контроллера с этой функцией.';
      const mNotes = smartOnly ? ['Управление со смартфона и голосом встроено — отдельный конвертер не нужен. С настенными панелями и датчиками DALI не работает.', busNote] : [busNote];
      mNotes.push('До 64 адресов, 16 групп и 16 сцен на мастер-контроллер.');
      project.unshift(item('Мастер-контроллер DALI' + (lines > 1 ? ' — по одному на линию' : ''), { skus: [smartOnly ? '721010' : '721008'], qty: lines, notes: mNotes }));
      if (!smartOnly && (ctl.digital || ctl.remote)) project.splice(1, 0, item('Конвертер Wi-Fi / RF – DALI', { skus: ['721005'], qty: lines, notes: ['Управление DALI ' + [ctl.digital ? 'со смартфона и голосом' : '', ctl.remote ? 'с RF-пульта' : ''].filter(Boolean).join(' и ') + (lines > 1 ? '. По одному на линию.' : '.') + ' Поддерживает цвет (RGB) и оттенок белого (MIX).'] }));
      if (daliInfo.mode === 'repeater' && daliInfo.picked.length) {
        project.push(item('Усилитель-ретранслятор DALI', { skus: KIT.daliRepeater, qty: daliInfo.picked.length, notes: ['В схеме с ретранслятором светильники за ним управляются одной группой: ' + daliInfo.picked.map(z => z.name).join(', ') + '.'] }));
        for (const r of rooms) for (const z of r.zones) if (daliInfo.picked.some(x => x.id === z.id)) z.notes.push('Зона за ретранслятором 721014: светильники управляются одной группой.');
      }
    }
    return { method: option.title, project, rooms, dali: daliInfo };
  }

  /* DALI: подсчёт адресов и вариант при превышении 64 */
  function daliPlan(p, rooms, zones, relayAddr) {
    const LIMIT = 64;
    const known = zones.filter(z => z.addr !== null);
    const unknown = zones.filter(z => z.addr === null).map(z => z.name);
    const total = known.reduce((a, z) => a + z.addr, 0) + relayAddr;
    const groups = zones.length, GLIM = 16;
    const info = { total, unknown, limit: LIMIT, groups, glimit: GLIM, over: total > LIMIT || groups > GLIM, mode: 'single', lines: [], picked: [], repeaterOk: false, recommended: 'single' };
    if (!info.over) return info;
    // Вариант 1: линии по помещениям
    const perRoom = rooms.map(r => ({ id: r.id, name: r.name, addr: known.filter(z => z.roomId === r.id).reduce((a, z) => a + z.addr, 0), groups: zones.filter(z => z.roomId === r.id).length })).filter(r => r.groups > 0);
    let cur = { rooms: [], addr: relayAddr, groups: 0 };
    for (const r of perRoom) { if (cur.rooms.length && (cur.addr + r.addr > LIMIT || cur.groups + r.groups > GLIM)) { info.lines.push(cur); cur = { rooms: [], addr: 0, groups: 0 }; } cur.rooms.push(r.name); cur.addr += r.addr; cur.groups += r.groups; }
    if (cur.rooms.length) info.lines.push(cur);
    info.roomOver = perRoom.filter(r => r.addr > LIMIT || r.groups > GLIM).map(r => r.name);
    // Вариант 2: ретранслятор — выносим крупные зоны
    let main = total; const cand = known.filter(z => z.addr > 1 && z.addr <= LIMIT).sort((a, b) => b.addr - a.addr);
    for (const z of cand) { if (main <= LIMIT) break; info.picked.push(z); main = main - z.addr + 1; }
    info.repeaterOk = main <= LIMIT && groups <= GLIM; info.mainAfter = main;
    if (!info.repeaterOk) info.picked = [];
    info.recommended = info.repeaterOk && info.picked.length === 1 ? 'repeater' : 'lines';
    info.mode = p.daliSplit === 'repeater' && info.repeaterOk ? 'repeater' : p.daliSplit === 'lines' ? 'lines' : info.recommended;
    return info;
  }

  const api = { KINDS, TITLES, STRIPS, LUMS, STRIPS_220: CAT.STRIPS_220, applyFix, evaluate, check, zoneHow: (m, s) => zoneHow(m, norm(s)), realItems, buildEquipment, capability: (m, s, o) => capability(m, norm(s), o), loadOf, voltageOf, needs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaytoniEngine = api;
})(this);

