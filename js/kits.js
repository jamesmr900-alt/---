/* Maytoni — калькуляторы комплектов и мастер подбора (без нейросети).
   Лента (лента + профиль + аксессуары + блок питания + управление), трековая система, DALI,
   проверка КП по правилам, сравнение двух КП, подбор «с нуля» по помещениям, разбор экспликации. */
(function (root) {
  'use strict';
  const MT = root.MT || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const all = () => MT.catalog.filter(MT.inPrice);
  const nameOf = x => x.n || x.a;
  const okStatus = x => x.st !== 'нет в прайсе 2026';
  const colorOk = (x, col) => !col || norm(x.col || x.n).includes(norm(col).slice(0, 4)) || (norm(col).startsWith('сереб') && /серебр|алюмин/.test(norm(x.col)));
  /** Выбор по уровню цены: бюджет — самый доступный, средний — середина, премиум — верхняя треть.
      Для «среднего» и «премиума» предпочитаются позиции не из распродажи. */
  function pickTier(list, tier, price = x => x.p) {
    if (!list.length) return null;
    let L = list.slice().sort((a, b) => price(a) - price(b));
    if (tier !== 'бюджет') { const main = L.filter(x => x.st !== 'Акция'); if (main.length) L = main; }
    const i = tier === 'премиум' ? Math.floor((L.length - 1) * 0.8) : tier === 'средний' ? Math.floor((L.length - 1) / 2) : 0;
    return L[i];
  }
  const packOf = x => +((nameOf(x).match(/(\d+)\s*шт/i) || [])[1] || 1);
  const row = (x, qty, note, group) => ({ a: x.a, qty: Math.max(1, Math.round(qty)), n: nameOf(x), p: x.p, note: note || '', group: group || '' });

  /* ================= Лента ================= */
  const MAX_RUN = { 12: 5, 24: 10, 48: 20, 220: 50, 230: 50 };   // м на одну точку питания
  const PROFILE_SE = {
    'накладной': /^накладной профиль/i, 'угловой': /^накладной профиль/i, 'встраиваемый': /^встраиваемый с/i, 'в пол': /^встраиваемый в пол/i,
    'подвесной': /подвесной профиль/i, 'натяжной': /натяжного потолка/i, 'плинтус': /плинтус/i };
  function stripMode(x) { const f = MT.features(x); return f.mode || 'mono'; }
  function stripCandidates(o) {
    return all().filter(x => /^светодиодная лента/i.test(nameOf(x))).filter(x => {
      const f = MT.features(x);
      if (!f.volt || f.volt.lo !== (o.volt >= 200 ? 230 : o.volt)) return false;
      const ip = f.ip || 20; if (o.ip >= 44 ? ip < 44 : ip > 33) return false;
      const m = f.mode || 'mono'; if (m !== (o.mode || 'mono')) return false;
      if ((o.mode || 'mono') === 'mono' && o.cct && f.cct !== +o.cct) return false;
      return x.w > 0 && x.l > 0;
    });
  }
  function packPieces(pieces, reel) {   // раскрой отрезков по катушкам (first-fit decreasing)
    const bins = [];
    for (const p of pieces.slice().sort((a, b) => b - a)) { const b = bins.find(v => v + p <= reel + 1e-6); if (b !== undefined) bins[bins.indexOf(b)] += p; else bins.push(p); }
    return bins;
  }
  function profileKey(x) {
    const n = nameOf(x); const keys = [];
    const code = n.match(/ALM(-?)(\d{3,4}[A-Z]?)/i); if (code) keys.push('alm' + code[1] + code[2].toLowerCase());
    const sz = n.match(/(\d{1,2})\s*[x×х]\s*(\d{1,2})(?!\d)/i); if (sz) keys.push((+sz[1]) + 'x' + (+sz[2]));
    return keys;
  }
  function accessoryFor(prof, re, col) {
    const keys = profileKey(prof); if (!keys.length) return null;
    const tests = keys.map(k => k.startsWith('alm') ? new RegExp(k + '(?![0-9])', 'i') : new RegExp('(?:^|[^0-9])0*' + k.replace('x', '\\s*x\\s*0*') + '(?![0-9])', 'i'));
    const pool = all().filter(x => x.g === 'Ledstrip' && re.test(nameOf(x)) && /для профил/i.test(nameOf(x)));
    const nm = x => nameOf(x).replace(/[×х]/g, 'x');
    const order = keys.map((k, i) => [k.startsWith('alm') ? 1 : 0, tests[i]]).sort((a, b) => a[0] - b[0]);   // сначала по размеру, потом по коду
    for (const [, t] of order) { const c = pool.filter(x => t.test(nm(x))); if (c.length) return c.find(x => colorOk(x, col)) || c[0]; }
    return null;
  }
  const RC = { power: (x, volt) => { const m = nameOf(x).match(/(\d+)\s*Вт\s*\/\s*(\d+)\s*Вт(?:\s*\/\s*(\d+)\s*Вт)?/i);
    if (m) return volt <= 12 ? +m[1] : volt <= 24 ? +m[2] : +(m[3] || m[2]); return x.w || 0; } };
  /** Подсветка лентой.
      o: {segments:[{name,len}], volt, mode:'mono'|'MIX'|'RGB'|'RGBW', cct, wpm, ip, tier, profile, profileColor, control:'none'|'RF'|'Wi-Fi'|'Zigbee'|'DALI'|'TRIAC', room} */
  function lentaCalc(o) {
    const tier = o.tier || 'средний', warn = [], rows = [], room = o.room || '';
    const segs = (o.segments || []).filter(s => +s.len > 0).map(s => ({ name: s.name || '', len: +s.len }));
    if (!segs.length) return { error: 'Укажите длины участков подсветки' };
    let cand = stripCandidates(o);
    if (!cand.length) return { error: `Нет ленты: ${o.volt} В, ${o.mode || 'одноцветная'}${(o.mode || 'mono') === 'mono' ? ' ' + o.cct + 'K' : ''}, IP${o.ip}. Измените параметры.` };
    if (o.wpm) { const best = Math.min(...cand.map(x => Math.abs(x.w - o.wpm))); cand = cand.filter(x => Math.abs(x.w - o.wpm) <= best + 0.5); }
    const strip = pickTier(cand, tier, x => x.p / (x.l / 1000));
    const reel = strip.l / 1000, runV = MAX_RUN[o.volt] || 10;
    const pieces = []; segs.forEach(s => { let r = s.len; while (r > 1e-6) { const p = Math.min(r, reel); pieces.push(p); r -= p; } });
    const feeds = segs.reduce((t, s) => t + Math.ceil(s.len / runV - 1e-9), 0);
    const bins = packPieces(pieces, reel), total = segs.reduce((t, s) => t + s.len, 0), P = total * strip.w;
    rows.push(row(strip, bins.length, `${total.toFixed(1)} м, катушка ${reel} м; раскрой: ${bins.map(b => b.toFixed(1)).join(' + ')} м`, 'Лента'));
    if (feeds > segs.length) warn.push(`Участки длиннее ${runV} м при ${o.volt} В: нужно ${feeds} точек подключения питания (провод от блока питания к каждой части, чтобы не было падения яркости).`);
    // блок питания и управление
    const need = P * 1.25, volt = o.volt >= 200 ? 230 : +o.volt, ctrl = o.control || 'none', mode = o.mode || 'mono';
    const psuAll = all().filter(x => MT.kind(x) === 'блок питания' && !/аварийн|шины dali/i.test(nameOf(x))).filter(x => { const f = MT.features(x); return f.volt && f.volt.lo === volt && f.volt.hi === volt && x.w > 0; });
    const psuIP = x => { const ip = MT.features(x).ip || 20; return o.ip >= 44 ? true : ip <= 67; };
    let psuRows = [], psuW = 0, dalipsu = false;
    if (volt !== 230) {
      let base = psuAll.filter(psuIP);
      if (ctrl === 'DALI' && (mode === 'mono' || mode === 'MIX')) {
        const dt = mode === 'mono' ? /dt6/i : /dt8/i, d = base.filter(x => /dali/i.test(nameOf(x)) && dt.test(nameOf(x)));
        if (d.length) { base = d; dalipsu = true; }
      }
      if (!dalipsu) base = base.filter(x => !/dali/i.test(nameOf(x)));
      if (!base.length) warn.push(`Нет блока питания ${volt} В в прайсе.`);
      else {
        const maxW = Math.max(...base.map(x => x.w)), n = Math.max(1, Math.ceil(need / maxW)), per = need / n;
        const fit = base.filter(x => x.w >= per), psu = pickTier(fit.filter(x => x.w <= Math.min(...fit.map(v => v.w)) * 1.5), tier === 'премиум' ? 'средний' : tier) || pickTier(fit, 'бюджет');
        psuRows.push(row(psu, n, `нагрузка ${Math.round(P)} Вт ×1,25 = ${Math.round(need)} Вт${n > 1 ? `, ${n} блока по ${Math.round(per)} Вт` : ''}`, 'Питание'));
        psuW = psu.w * n;
      }
    }
    rows.push(...psuRows);
    if (ctrl !== 'none' && !dalipsu) {
      const ch = { mono: 1, MIX: 2, RGB: 3, RGBW: 4 }[mode];
      const PR = { RF: null, 'Wi-Fi': 'Wi-Fi', Zigbee: 'Zigbee', DALI: 'DALI', TRIAC: 'TRIAC' }[ctrl];
      const cands = all().filter(x => ['контроллер', 'диммер'].includes(MT.kind(x)) && x.g === 'Control').filter(x => {
        const f = MT.features(x), n = nameOf(x);
        if (PR ? !f.proto.has(PR) : (f.proto.has('DALI') || f.proto.has('Zigbee') || f.proto.has('Wi-Fi') || f.proto.has('TRIAC') || /мастер|union|bluetooth|spi/i.test(n))) return false;
        const fm = f.mode || (/монохром|dim/i.test(n) ? 'mono' : MT.kind(x) === 'диммер' ? 'mono' : null);
        if (mode === 'mono' ? fm && fm !== 'mono' && !/dim/i.test(n) : !(fm === mode || (mode === 'MIX' && /cct|mix/i.test(n)) || (mode === 'RGBW' && /rgbw|\+w/i.test(n)) || (mode === 'RGB' && /rgb/i.test(n) && !/\+w|rgbw/i.test(n)))) return false;
        if (f.volt && volt !== 230 && (f.volt.lo > volt || f.volt.hi < volt)) return false;
        return /DIN|мастер/i.test(n) ? false : true;
      });
      if (!cands.length) warn.push(`Нет контроллера ${ctrl} для режима ${mode} — подберите вручную.`);
      else {
        const withP = cands.map(x => ({ x, w: RC.power(x, volt) })).filter(v => v.w > 0);
        const fit = withP.filter(v => v.w >= P); const pool = (fit.length ? fit : withP.length ? withP : cands.map(x => ({ x, w: 0 })));
        const c = pickTier(pool.map(v => v.x), tier === 'премиум' ? 'средний' : 'бюджет');
        const cw = RC.power(c, volt) || P, n = Math.max(1, Math.ceil(P / cw));
        rows.push(row(c, n, `${ctrl === 'RF' ? 'радиопульт' : ctrl}, ${ch} кан., до ${Math.round(cw)} Вт при ${volt} В`, 'Управление'));
        if (ctrl === 'RF') {
          const mw = mode === 'mono' ? /монохром/i : mode === 'MIX' ? /mix/i : mode === 'RGB' ? /rgb(?!-mix)/i : /rgbw/i;
          const pult = all().filter(x => MT.kind(x) === 'пульт' && mw.test(nameOf(x)) && /светодиодной ленты/i.test(nameOf(x)));
          const pp = pickTier(pult, 'бюджет'); if (pp) rows.push(row(pp, 1, 'пульт к контроллеру', 'Управление')); else warn.push('Пульт к контроллеру подберите вручную.');
        }
        if (ctrl === 'Zigbee') { const hub = all().find(x => /ХАБ|хаб/.test(nameOf(x))); if (hub) rows.push(row(hub, 1, 'центр управления (если ещё нет)', 'Управление')); }
      }
    }
    if (dalipsu) warn.push('Блок питания с DALI: нужен мастер-контроллер и питание шины DALI (вкладка DALI).');
    // профиль
    let prof = null;
    if (o.profile && o.profile !== 'none') {
      const re = PROFILE_SE[o.profile];
      let pc = all().filter(x => x.g === 'Ledstrip' && MT.kind(x) === 'профиль' && re.test(x.se || '') && x.l >= 1000 && /профиль/i.test(nameOf(x)));
      if (o.profile === 'угловой') pc = pc.filter(x => /углов/i.test(nameOf(x))); else if (o.profile === 'накладной') pc = pc.filter(x => !/углов/i.test(nameOf(x)));
      { const std = pc.filter(x => !/изгиб|радиус|гибк|неон/i.test(nameOf(x))); if (std.length) pc = std; }
      const byCol = pc.filter(x => colorOk(x, o.profileColor)); if (byCol.length) pc = byCol; else if (o.profileColor) warn.push(`Профиля цвета «${o.profileColor}» нет — взят другой цвет.`);
      if (strip.wd) { const w = pc.filter(x => !x.wd || x.wd >= strip.wd + 2); if (w.length) pc = w; }
      prof = pickTier(pc, tier);
      if (!prof) warn.push('Профиль такого типа не найден.');
      else {
        const pl = prof.l / 1000, n = segs.reduce((t, s) => t + Math.ceil(s.len / pl), 0);
        rows.push(row(prof, n, `по ${pl} м, ${segs.length} уч.`, 'Профиль'));
        const ec = accessoryFor(prof, /заглуш/i, o.profileColor); const needEC = segs.length * 2;
        if (ec) rows.push(row(ec, Math.ceil(needEC / packOf(ec)), `${needEC} заглушек`, 'Профиль')); else warn.push('Заглушки к профилю: проверьте комплектацию (в прайсе не найдены по коду профиля).');
        const mt = accessoryFor(prof, /креплен/i, o.profileColor); const needMT = segs.reduce((t, s) => t + Math.ceil(s.len / 0.6) + 1, 0);
        if (mt) rows.push(row(mt, Math.ceil(needMT / packOf(mt)), `${needMT} креплений (шаг ~0,6 м)`, 'Профиль'));
        const df = accessoryFor(prof, /рассеив/i, 'бел') ; const totalProf = n * pl;
        if (df) rows.push(row(df, Math.ceil(totalProf / (df.l / 1000 || 2)), `рассеиватель на ${totalProf.toFixed(1)} м`, 'Профиль'));
        else warn.push('Рассеиватель: проверьте, входит ли он в комплект профиля.');
      }
    }
    if (o.ip >= 44 && (MT.features(rows.find(r => r.group === 'Питание') ? MT.get(rows.find(r => r.group === 'Питание').a) : {}).ip || 20) < 44) warn.push('Блок питания IP20 — ставьте его вне влажной зоны.');
    return { rows: rows.map(r => Object.assign(r, { room })), warn, info: { strip: strip.a, wpm: strip.w, total, P: Math.round(P), psuW, load: psuW ? Math.round(P / psuW * 100) : null, reels: bins.length, pieces } };
  }

  /* ================= Трековая система ================= */
  function trackSystems() {
    const s = {}; all().filter(x => MT.kind(x) === 'шинопровод' && x.c).forEach(x => { s[x.c] = (s[x.c] || 0) + 1; });
    return Object.keys(s).sort();
  }
  function systemParts(sys) { return all().filter(x => x.c === sys); }
  /** o: {system, mount:'накладной'|'подвесной'|'встраиваемый'|'натяжной', color, runs:[м], L, T, X, fixtures:[{a,qty}], auto:{count, cct, w}, tier, room} */
  function trackCalc(o) {
    const tier = o.tier || 'средний', warn = [], rows = [], parts = systemParts(o.system), room = o.room || '';
    if (!parts.length) return { error: 'Выберите трековую систему' };
    const inb = /встраив/i, wantIn = o.mount === 'встраиваемый';   // в натяжной потолок — обычный шинопровод в профиле для натяжного потолка
    const mountOk = x => wantIn ? inb.test(nameOf(x)) || !/накладн/i.test(nameOf(x)) : !inb.test(nameOf(x));
    const col = o.color;
    const pick = (re, not, kinds = ['комплектующие', 'аксессуар']) => {
      let c = parts.filter(x => kinds.includes(MT.kind(x)) && re.test(nameOf(x)) && !(not && not.test(nameOf(x))));
      const m = c.filter(mountOk); if (m.length) c = m;
      const k = c.filter(x => colorOk(x, col)); if (k.length) c = k;
      return pickTier(c, 'бюджет');
    };
    let rails = parts.filter(x => MT.kind(x) === 'шинопровод' && x.l >= 500);
    const rm = rails.filter(mountOk); if (rm.length) rails = rm; else warn.push(`В системе нет шинопровода для монтажа «${o.mount}» — взят другой.`);
    const rc = rails.filter(x => colorOk(x, col)); if (rc.length) rails = rc; else if (col) warn.push(`Шинопровода цвета «${col}» нет.`);
    const lens = {}; rails.forEach(x => { const L = Math.round(x.l / 500) * 0.5; if (!lens[L] || lens[L].p > x.p) lens[L] = x; });
    const sizes = Object.keys(lens).map(Number).sort((a, b) => b - a);
    if (!sizes.length) return { error: 'В системе нет шинопроводов' };
    const runs = (o.runs || []).map(Number).filter(v => v > 0); if (!runs.length) return { error: 'Укажите длины линий трека' };
    const used = {}; let joins = 0, cut = [];
    runs.forEach(r => { let rem = r, n = 0;
      while (rem > 0.05) { let s;
        if (rem <= sizes[0] + 0.05) s = sizes.slice().reverse().find(v => v >= rem - 0.05);   // остаток — одним куском (с подрезкой)
        else s = sizes.find(v => v <= rem + 0.05);
        if (s === undefined) s = sizes[sizes.length - 1];
        if (s > rem + 0.05) cut.push(`${s} м → отрезать до ${rem.toFixed(2)} м`); used[s] = (used[s] || 0) + 1; rem -= s; n++; }
      joins += Math.max(0, n - 1); });
    Object.entries(used).forEach(([s, n]) => rows.push(row(lens[s], n, `${s} м`, 'Шинопровод')));
    const total = runs.reduce((a, b) => a + b, 0);
    const add = (x, n, note, missMsg) => { if (!n) return; if (x) { const pk = packOf(x); rows.push(row(x, Math.ceil(n / pk), pk > 1 ? `${note}: нужно ${n} шт, в упаковке ${pk}` : note, 'Комплектующие')); } else warn.push(missMsg); };
    add(pick(/коннектор\s+прямой|прямой\s+коннектор|соединитель\s+прямой/i, /питани/i), joins, 'стыки шинопровода', 'Прямой коннектор в системе не найден.');
    add(pick(/l-образн|угловой\s+коннектор|коннектор\s+угловой/i, /питани/i), +o.L || 0, 'углы', 'L-коннектор в системе не найден.');
    add(pick(/[тt]-образн/i, /питани/i), +o.T || 0, 'Т-соединения', 'T-коннектор в системе не найден.');
    add(pick(/[хx]-образн/i, /питани/i), +o.X || 0, 'X-соединения', 'X-коннектор в системе не найден.');
    const feed = pick(/ввод\s+питани|токоподвод|коннектор\s+питани/i, /профил/i); add(feed, 1, 'подключение к сети', 'Ввод питания в системе не найден — проверьте.');
    const ends = Math.max(0, 2 * runs.length - 2 * (+o.L || 0) - 3 * (+o.T || 0) - 4 * (+o.X || 0) - (feed ? 1 : 0));
    add(pick(/заглуш/i, /профил/i), ends, 'свободные концы', 'Заглушки в системе не найдены — проверьте.');
    if (o.mount === 'подвесной') add(pick(/подвес|трос/i, /светильник/i), runs.reduce((t, r) => t + Math.ceil(r / 1.5) + 1, 0), 'подвес каждые ~1,5 м', 'Подвесы в системе не найдены.');
    if (o.mount === 'натяжной') { const pr = parts.filter(x => MT.kind(x) === 'профиль' && /натяжн/i.test(nameOf(x)));
      if (pr.length) { const p = pickTier(pr, 'бюджет'); rows.push(row(p, runs.reduce((t, r) => t + Math.ceil(r / (p.l / 1000 || 2)), 0), 'профиль для натяжного потолка', 'Комплектующие')); }
      else warn.push('Профиль для натяжного потолка в системе не найден.'); }
    // светильники
    let fixW = 0;
    for (const f of o.fixtures || []) { const x = MT.get(f.a); if (!x) { warn.push(`Нет артикула ${f.a}`); continue; }
      if (x.c !== o.system) warn.push(`${x.a} — из другой системы (${x.c || '?'}).`);
      rows.push(row(x, f.qty, '', 'Светильники')); fixW += (x.w || 0) * f.qty; }
    if (o.auto && o.auto.count > 0) {
      let fx = parts.filter(x => MT.kind(x) === 'трековый' && colorOk(x, col));
      if (o.auto.cct) { const k = fx.filter(x => MT.features(x).cct === +o.auto.cct); if (k.length) fx = k; }
      if (o.auto.w) { const best = Math.min(...fx.map(x => Math.abs((x.w || 0) - o.auto.w))); fx = fx.filter(x => Math.abs((x.w || 0) - o.auto.w) <= best + 2); }
      const x = pickTier(fx, tier); if (x) { rows.push(row(x, o.auto.count, 'подобран автоматически', 'Светильники')); fixW += (x.w || 0) * o.auto.count; } else warn.push('Трековый светильник с такими параметрами не найден.');
    }
    // питание низковольтных систем
    const low = /магнит|низковольт|48/i.test(o.system) || rows.some(r => /48\s*В/i.test(r.n));
    if (low && fixW > 0) {
      const sysWord = (o.system.match(/[A-Z]{4,}/) || [''])[0];
      let ps = all().filter(x => MT.kind(x) === 'блок питания' && /48\s*В|48V/i.test(nameOf(x)) && !/аварийн/i.test(nameOf(x)));
      const own = ps.filter(x => x.c === o.system || new RegExp(sysWord, 'i').test((x.comp || '') + nameOf(x))); if (own.length) ps = own;
      const need = fixW * 1.2, maxW = Math.max(...ps.map(x => x.w || 0));
      if (ps.length && maxW > 0) { const n = Math.ceil(need / maxW), fit = ps.filter(x => x.w >= need / n), p = pickTier(fit.filter(x => x.w <= Math.min(...fit.map(v => v.w)) * 1.5), 'бюджет');
        rows.push(row(p, n, `светильники ${Math.round(fixW)} Вт ×1,2`, 'Питание')); }
      else warn.push('Блок питания 48 В для системы подберите вручную.');
    }
    if (cut.length) warn.push('Подрезка шинопровода: ' + cut.join('; ') + '.');
    warn.push('Проверьте по каталогу системы: способ крепления к потолку, тип ввода питания и совместимость с выбранными светильниками.');
    return { rows: rows.map(r => Object.assign(r, { room })), warn, info: { total, joins, ends, fixW: Math.round(fixW), low } };
  }

  /* ================= DALI ================= */
  /** o: {devices, sensors, panels, master:'smart'|'basic'|'none'} */
  function daliCalc(o) {
    const rows = [], warn = [], addr = (+o.devices || 0) + (+o.sensors || 0) + (+o.panels || 0);
    if (!addr) return { error: 'Укажите количество DALI-устройств' };
    const lines = Math.ceil(addr / 64);
    const busPSU = pickTier(all().filter(x => /источник питания шины dali/i.test(nameOf(x))), 'бюджет');
    let master = null;
    if (o.master === 'smart') master = all().find(x => /мастер-контроллер smart dali/i.test(nameOf(x)));
    if (o.master === 'basic') master = all().find(x => /мастер-контроллер dali/i.test(nameOf(x)) && !/smart/i.test(nameOf(x)));
    if (master) rows.push(row(master, lines, `по одному на линию (${lines} лин.)`, 'DALI'));
    if (busPSU) rows.push(row(busPSU, lines, 'питание шины на каждую линию', 'DALI'));
    else warn.push('Источник питания шины DALI не найден.');
    warn.push(`Адресов: ${addr} → линий DALI: ${lines} (до 64 адресов на линию, до 250 мА на шину).`);
    if (master) warn.push('Уточните по паспорту мастер-контроллера, есть ли в нём встроенное питание шины — тогда отдельный источник не нужен.');
    return { rows, warn, info: { addr, lines } };
  }

  /* ================= Проверка КП по правилам ================= */
  function kpRuleCheck(rows) {
    const out = [], by = new Map();
    rows.forEach(r => { const x = MT.get(r.a); const k = r.room || '—'; if (!by.has(k)) by.set(k, []); by.get(k).push({ r, x }); });
    const W = (room, level, text) => out.push({ room, level, text });
    for (const [room, list] of by) {
      const bath = MT.normFor(room).id === 'bath';
      for (const { r, x } of list) {
        if (!x) { W(room, 'error', `${r.a}: нет в каталоге Maytoni`); continue; }
        if (!x.p) W(room, 'warn', `${x.a}: нет цены в прайсе 2026 — проверьте наличие`);
        if (x.st === 'Акция') W(room, 'info', `${x.a}: статус «Акция» (распродажа) — проверьте остаток`);
      }
      const items = list.filter(v => v.x), lum = items.filter(v => ['tech', 'decor'].includes(MT.cls(v.x)) && !['комплектующие', 'аксессуар', 'профиль', 'шинопровод', 'лента'].includes(MT.kind(v.x)));
      if (bath) lum.forEach(v => { const ip = MT.features(v.x).ip || 20; if (ip < 44) W(room, 'error', `${v.x.a}: IP${ip} во влажном помещении — нужен IP44 и выше`); });
      const cols = [...new Set(lum.map(v => MT.features(v.x).col).filter(Boolean))];
      if (cols.length > 1) W(room, 'info', `Разные цвета корпусов: ${cols.join(', ')} — проверьте, что так задумано`);
      // источники к цокольным светильникам
      const capNeed = {}, capHave = {};
      lum.forEach(v => { const f = MT.features(v.x); if (f.cap && !/встроен/i.test(nameOf(v.x))) capNeed[f.cap] = (capNeed[f.cap] || 0) + v.r.qty * (f.nl || 1); });
      items.filter(v => MT.cls(v.x) === 'source').forEach(v => { const f = MT.features(v.x); const c = f.cap || (MT.kind(v.x) === 'модуль' ? 'GU10' : null); if (c) capHave[c] = (capHave[c] || 0) + v.r.qty; });
      Object.entries(capNeed).forEach(([c, n]) => { const h = capHave[c] || 0; if (h < n) W(room, h ? 'warn' : 'info', `Цоколь ${c}: светильникам нужно ${n} ламп, в КП ${h}`); });
      // узкий угол в утопленных, модули в накладных
      const deep = lum.some(v => MT.fixtureProfile(v.x).mount === 'deep');
      items.filter(v => MT.cls(v.x) === 'source').forEach(v => { const a = v.x.ang || 0;
        if (deep && a > 60) W(room, 'warn', `${v.x.a}: угол ${a}° в утопленном светильнике — до половины света останется в корпусе, нужна лампа 38–40° или модуль до 60°`);
        if (MT.kind(v.x) === 'модуль' && lum.some(l => ['подвесной', 'накладной', 'потолочный', 'настенный'].includes(MT.kind(l.x)) && MT.features(l.x).cap === 'GU10') && !lum.some(l => MT.kind(l.x) === 'встраиваемый'))
          W(room, 'warn', `${v.x.a}: модуль — только для встраиваемых светильников, в накладные и подвесные нужна лампа`); });
      // лента и блоки питания
      const strips = items.filter(v => MT.kind(v.x) === 'лента' && /светодиодная лента/i.test(nameOf(v.x)));
      const psus = items.filter(v => MT.kind(v.x) === 'блок питания');
      if (strips.length) {
        const P = strips.reduce((t, v) => t + (v.x.w || 0) * (v.x.l || 5000) / 1000 * v.r.qty, 0), Pp = psus.reduce((t, v) => t + (v.x.w || 0) * v.r.qty, 0);
        const sv = new Set(strips.map(v => (MT.features(v.x).volt || {}).lo)), pv = new Set(psus.map(v => (MT.features(v.x).volt || {}).lo));
        if (!psus.length && ![...sv].some(v => v >= 200)) W(room, 'error', `Лента без блока питания (≈${Math.round(P)} Вт, если вся катушка в работе)`);
        else if (Pp && Pp < P * 1.1) W(room, Pp < P * 0.5 ? 'warn' : 'info', `Блоки питания ${Math.round(Pp)} Вт < лента ≈${Math.round(P)} Вт (при полной длине катушек) — проверьте фактическую длину и запас 20–30%`);
        [...sv].forEach(v => { if (psus.length && v < 200 && !pv.has(v)) W(room, 'error', `Лента ${v} В, а блоки питания ${[...pv].join('/')} В`); });
      }
      // трек
      const rails = items.filter(v => MT.kind(v.x) === 'шинопровод'), tfx = items.filter(v => ['трековый', 'трековый подвесной'].includes(MT.kind(v.x)));
      const sys = new Set(rails.map(v => v.x.c));
      tfx.forEach(v => { if (sys.size && !sys.has(v.x.c)) W(room, 'error', `${v.x.a}: светильник системы «${v.x.c}», а шинопровод — «${[...sys].join(', ')}»`); });
      if (rails.length && !items.some(v => /ввод\s+питани|коннектор\s+питани|токоподвод/i.test(nameOf(v.x)))) W(room, 'warn', 'Шинопровод без ввода питания');
      if (tfx.length && !rails.length) W(room, 'info', 'Трековые светильники без шинопровода в этом помещении');
      // протоколы
      const ctl = items.filter(v => ['диммер', 'контроллер', 'блок питания', 'драйвер', 'датчик', 'панель управления'].includes(MT.kind(v.x)));
      const protos = new Set(); ctl.forEach(v => MT.features(v.x).proto.forEach(p => ['DALI', 'TRIAC', 'Zigbee', 'Wi-Fi', '0-10V', 'KNX'].includes(p) && protos.add(p)));
      if (protos.size > 1) W(room, 'warn', `В помещении разные протоколы управления: ${[...protos].join(', ')} — проверьте, что группы не смешаны`);
    }
    const allItems = rows.map(r => MT.get(r.a)).filter(Boolean);
    const dali = allItems.some(x => MT.features(x).proto.has('DALI') && ['диммер', 'контроллер', 'блок питания', 'драйвер'].includes(MT.kind(x)));
    if (dali && !allItems.some(x => /шины dali|мастер-контроллер/i.test(nameOf(x)))) W('Весь объект', 'warn', 'Есть DALI-устройства, но нет мастер-контроллера и питания шины DALI');
    return out;
  }

  /** Сравнение двух КП по артикулам. */
  function kpCompare(A, B) {
    const agg = rows => { const m = new Map(); rows.forEach(r => { m.set(r.a, (m.get(r.a) || 0) + (+r.qty || 0)); }); return m; };
    const a = agg(A), b = agg(B), keys = [...new Set([...a.keys(), ...b.keys()])];
    let ta = 0, tb = 0;
    const lines = keys.map(k => { const x = MT.get(k), p = x && x.p || 0, qa = a.get(k) || 0, qb = b.get(k) || 0; ta += qa * p; tb += qb * p;
      return { a: k, n: x ? nameOf(x) : '—', p, qa, qb, sa: qa * p, sb: qb * p, d: (qb - qa) * p, status: !qa ? 'добавлено' : !qb ? 'убрано' : qa !== qb ? 'изменено' : 'без изменений' }; });
    lines.sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
    return { lines, ta, tb, d: tb - ta };
  }

  /* ================= Подбор «с нуля» ================= */
  const VARIANTS = ['бюджет', 'средний', 'премиум'];
  function lampFor(cap, cct) {
    const L = all().filter(x => x.g === 'Voltega' && MT.kind(x) === 'лампа' && MT.features(x).cap === cap && (!cct || MT.features(x).cct === +cct));
    return pickTier(L.filter(x => x.st !== 'Акция').length ? L.filter(x => x.st !== 'Акция') : L, 'бюджет');
  }
  function decorFor(kindName, col, tier, opt = {}) {
    let c = all().filter(x => MT.kind(x) === kindName && ['Decor', 'Technical'].includes(x.g) && x.p > 0 && /светильник|бра/i.test(nameOf(x)) && !/трек/i.test(x.c || ''));
    if (opt.single) c = c.filter(x => (MT.features(x).nl || 1) === 1);
    if (opt.maxD) c = c.filter(x => !x.dm || x.dm <= opt.maxD);
    const k = c.filter(x => colorOk(x, col)); if (k.length) c = k;
    if (opt.led) { const l = c.filter(x => !MT.features(x).cap); if (l.length) c = l; }
    return pickTier(c, tier);
  }
  /* Назначение ленты → параметры подбора. Профиль подбирается только для световой линии (без него линии нет). */
  const STRIP_USE = {
    'карниз': { label: 'закарнизная подсветка', wpm: 9.6 },
    'кухня': { label: 'рабочая поверхность кухни', wpm: 14.4, cct: 4000 },
    'ниша': { label: 'ниши и полки', wpm: 4.8 },
    'линия': { label: 'световая линия', wpm: 14.4, profile: true },
    'парящий': { label: 'парящий потолок / контур', wpm: 9.6 },
    'ступени': { label: 'ступени, пол', wpm: 4.8 },
    'ванная': { label: 'влажная зона', wpm: 9.6, ip: 65 },
  };
  const STRETCH_FRAMELESS = ['Neo', 'Intro', 'Intro 2.0'];
  const isTRS = x => /TRS/.test(x.a);
  const isStretchFL = x => STRETCH_FRAMELESS.includes(x.se) && /светильник/i.test(nameOf(x));
  const ledFlux = x => { const ph = MT.photometryFor(x.a); return ph && ph.flux ? ph.flux : x.lm || 0; };
  /** room: {name, L, W, S, H, ceiling, mount, model, frameless, color, table, island, stripUse, strip, track, trackMount, bra, accentColor} → строки варианта */
  function roomKit(room, tier, glob = {}) {
    const rows = [], notes = [], name = room.name || 'Помещение';
    let L = +room.L, W = +room.W; const S = +room.S; if (!(L > 0 && W > 0) && S > 0) { L = Math.sqrt(S * 1.3); W = S / L; }
    if (!(L > 0 && W > 0)) return { rows, notes: ['нет размеров'], calc: null };
    const H = +room.H || 2.75, nr = MT.normFor(name), bath = nr.id === 'bath', col = room.color || glob.color || 'белый', cct = +(glob.cct || 3000);
    const R = { L: Math.max(L, W), W: Math.min(L, W), H, E: nr.E, Ke: 0.8, rp: 0.7, rc: 0.5, rr: 0.2 };
    // ---- общий свет: тип монтажа, безрамочность, модель, LED / сменная лампа ----
    const surface = room.mount === 'накладной' || (room.mount !== 'встраиваемый' && room.ceiling === 'бетон');
    const frameless = !!room.frameless && !surface;
    if (room.frameless && surface) notes.push('безрамочный монтаж возможен только во встраиваемых светильниках — для накладных не учитывается');
    const forced = room.model ? MT.get(String(room.model).trim()) : null;
    if (room.model && !forced) notes.push(`артикул «${room.model}» не найден в каталоге — модель подобрана автоматически`);
    let f = forced, mode = '';
    if (!f) {
      let fx = all().filter(x => x.g === 'Technical' && (MT.features(x).nl || 1) === 1 && !/трек|магнит/i.test(x.c || '') && /светильник/i.test(nameOf(x)) && (surface ? ['накладной', 'потолочный'].includes(MT.kind(x)) : MT.kind(x) === 'встраиваемый'));
      if (!surface) {
        if (frameless && room.ceiling === 'ГКЛ') { fx = fx.filter(isTRS); mode = 'безрамочные под шпаклёвку (TRS)'; }
        else if (frameless && room.ceiling === 'натяжной') { fx = fx.filter(isStretchFL); mode = 'безрамочные в натяжной потолок (Neo, Intro, Intro 2.0)'; }
        else { fx = fx.filter(x => !isTRS(x) && !isStretchFL(x)); if (frameless) notes.push('безрамочный монтаж — для ГКЛ или натяжного потолка; подобраны обычные встраиваемые'); }
      }
      if (bath) fx = fx.filter(x => (MT.features(x).ip || 20) >= 44);
      const fc = fx.filter(x => colorOk(x, col)); if (fc.length) fx = fc;
      const caps = fx.filter(x => ['GU10', 'GX53'].includes(MT.features(x).cap));
      const leds = fx.filter(x => !MT.features(x).cap && ledFlux(x) > 0 && (!MT.features(x).cct || MT.features(x).cct === cct || MT.features(x).cct === 'сменная'));
      // премиум — при прочих равных светильники со встроенным LED; бюджет и средний — под сменную лампу
      const pool = tier === 'премиум' ? (leds.length ? leds : caps) : (caps.length ? caps : leds);
      f = pickTier(pool, tier);
      if (!f && frameless) notes.push('нет безрамочных светильников по условиям (цвет, IP) — снимите галочку или смените цвет');
    }
    if (forced && bath && (MT.features(forced).ip || 20) < 44) notes.push(`${forced.a}: IP${MT.features(forced).ip || 20} во влажном помещении — нужен IP44+`);
    let calc = null;
    if (f) {
      const nMin = Math.max(1, Math.round(R.L / 1.5)) * Math.max(1, Math.round(R.W / 1.5));   // шаг ~1–1,5 м
      const ph = MT.photometryFor(f.a), cap = MT.features(f).cap, tag = mode ? `, ${mode}` : '';
      if (!cap) {   // встроенный LED: поток и кривая — из КСС производителя или каталога
        const F = ledFlux(f), curve = ph ? ph.curve : MT.beamCurve(f.ang || 60);
        if (F) { const e = MT.estimate(curve, R, F), n = Math.max(e.N, Math.ceil(nMin * 0.7));
          rows.push({ a: f.a, qty: n, note: `общий свет, ${nr.E} лк, встроенный LED ${Math.round(F)} лм${ph ? ' (КСС)' : ''}${tag}`, group: 'Общий свет' });
          calc = { E: Math.round(e.En(n)), n, src: 'встроенный LED', fixture: f.a, norm: nr.E }; }
        else notes.push(`${f.a}: нет данных о потоке — посчитайте на вкладке «Светорасчёт»`);
      } else {
        const prof = MT.fixtureProfile(f); prof.cap = cap; if (cap === 'GX53') prof.mount = 'gx53'; else if (surface && !forced) prof.mount = 'shallow';
        if (ph) { prof.curve = ph.curve; prof.lor = ph.LOR; }
        const pk = MT.pickSource(prof, R, { existing: nMin, minShare: 1 });
        if (pk) {
          rows.push({ a: f.a, qty: pk.n, note: `общий свет, ${nr.E} лк${tag}`, group: 'Общий свет' });
          rows.push({ a: pk.src.a, qty: pk.n, note: `${pk.src.lm} лм, ${pk.src.ang}°`, group: 'Общий свет' });
          calc = { E: Math.round(pk.E), n: pk.n, src: pk.src.a, fixture: f.a, norm: nr.E };
        } else notes.push(`${f.a}: для цоколя ${cap} нет подходящих ламп в списке — подберите на вкладке «Светорасчёт»`);
      }
    } else notes.push('не найден светильник общего света по условиям');
    if (room.ceiling === 'натяжной' && !surface && !(frameless && f && isStretchFL(f))) notes.push('натяжной потолок: под встраиваемые нужны закладные платформы (в ассортименте Maytoni их нет)');
    // ---- подвесы над столом / островом ----
    for (const [key, label] of [['table', 'над столом'], ['island', 'над островом']]) {
      const len = +room[key]; if (!(len > 0)) continue;
      const n = Math.max(1, Math.round(len / 0.6)), p = decorFor('подвесной', room.accentColor || col, tier, { single: true, maxD: 400, led: tier === 'премиум' });
      if (p) { rows.push({ a: p.a, qty: n, note: `${label} ${len} м`, group: 'Декоративный свет' });
        const fp = MT.features(p); if (fp.cap) { const lp = lampFor(fp.cap, cct); if (lp) rows.push({ a: lp.a, qty: n * (fp.nl || 1), note: 'лампы к подвесам', group: 'Декоративный свет' }); } }
    }
    // ---- бра ----
    if (+room.bra > 0) { const b = decorFor('настенный', room.accentColor || col, tier, { led: tier === 'премиум' });
      if (b) { rows.push({ a: b.a, qty: +room.bra, note: 'бра', group: 'Декоративный свет' }); const fb = MT.features(b);
        if (fb.cap) { const lp = lampFor(fb.cap, cct); if (lp) rows.push({ a: lp.a, qty: +room.bra * (fb.nl || 1), note: 'лампы к бра', group: 'Декоративный свет' }); } } }
    // ---- лента по назначению ----
    if (+room.strip > 0) {
      const u = STRIP_USE[room.stripUse] || STRIP_USE['карниз'];
      const prof = u.profile ? (room.ceiling === 'натяжной' ? 'натяжной' : room.ceiling === 'бетон' ? 'накладной' : 'встраиваемый') : 'none';
      const lr = lentaCalc({ segments: [{ name: u.label, len: +room.strip }], volt: 24, mode: 'mono', cct: u.cct || cct, wpm: u.wpm, ip: bath || u.ip ? 65 : 20, tier, profile: prof, profileColor: col === 'черный' ? 'черн' : 'серебр', control: glob.control || 'none', room: name });
      if (lr.rows) lr.rows.forEach(r => rows.push({ a: r.a, qty: r.qty, note: r.note, group: 'Подсветка: ' + u.label })); else notes.push(lr.error);
      if (!u.profile) notes.push(`лента (${u.label}): профиль не подбирался — выберите его на вкладке «Комплекты» по месту монтажа`);
    }
    // ---- трековая система ----
    if (+room.track > 0) {
      const tm = room.trackMount && room.trackMount !== 'авто' ? room.trackMount : (room.ceiling === 'ГКЛ' ? 'встраиваемый' : room.ceiling === 'натяжной' ? 'натяжной' : 'накладной');
      const sys = glob.trackSystem || trackSystems().find(x => /EXILITY$/.test(x)) || trackSystems()[0];
      const tr = trackCalc({ system: sys, mount: tm, color: col === 'черный' ? 'черн' : 'бел', runs: [+room.track], auto: { count: Math.max(2, Math.ceil(+room.track / 0.8)), cct, w: 15 }, tier, room: name });
      if (tr.rows) tr.rows.forEach(r => rows.push({ a: r.a, qty: r.qty, note: r.note, group: 'Трек (' + tm + ')' })); else notes.push(tr.error);
      (tr.warn || []).filter(w => !/Проверьте по каталогу/.test(w)).forEach(w => notes.push('трек: ' + w));
    }
    return { rows: rows.map(r => Object.assign(r, { room: name })), notes, calc };
  }
  function wizard(rooms, glob = {}) {
    const out = {};
    for (const t of VARIANTS) {
      const rows = [], notes = [], calcs = [];
      rooms.forEach(r => { const k = roomKit(r, t, glob); rows.push(...k.rows); k.notes.forEach(n => notes.push(`${r.name}: ${n}`)); if (k.calc) calcs.push(Object.assign({ room: r.name }, k.calc)); });
      const pr = MT.priceKP(rows); out[t] = { rows, notes, calcs, total: pr.total };
    }
    return out;
  }

  /* ================= Экспликация из текста PDF ================= */
  function explication(lines) {
    const out = [], seen = new Set();
    const re = /(?:^|\s)(\d{1,2}[.,]\d{1,2}|\d{1,2})\.?\s+([А-ЯЁа-яё][А-ЯЁа-яё0-9 \-\/().,№]{1,48}?)\s+(\d{1,3}[.,]\d{1,2})(?:\s*(?:м²|м2|кв\.?\s*м))?(?=\s|$)/g;
    for (const l of lines) {
      let m; re.lastIndex = 0;
      while ((m = re.exec(l))) {
        const name = m[2].trim().replace(/\s{2,}/g, ' '), area = parseFloat(m[3].replace(',', '.'));
        if (!(area > 0.8 && area < 400) || /общая|итого|всего|площад|масштаб|лист|дата|этаж|план|экспликац|отметк|уровень|^н\b/i.test(name) || name.length < 3 || /^(м|мм|см|м2|м²)(\s|$)/i.test(name) || /\d[.,]?\d*\s*м(\s|$)/.test(name)) continue;
        const key = m[1] + name; if (seen.has(key)) continue; seen.add(key);
        out.push({ num: m[1].replace(',', '.'), name, area });
      }
    }
    return out;
  }

  const KITS = { STRIP_USE, pickTier, lentaCalc, trackSystems, trackCalc, daliCalc, kpRuleCheck, kpCompare, roomKit, wizard, explication, VARIANTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = KITS; else root.KITS = KITS;
})(typeof window !== 'undefined' ? window : globalThis);
