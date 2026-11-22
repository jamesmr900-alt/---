/* Maytoni — движок алгоритмов (без нейросети).
   Каталог, нормы, оценочный расчёт освещённости (метод коэффициента использования),
   точечный расчёт с картой в фиктивных цветах, подбор источников света, аналогов и КП.
   Работает в браузере (window.MT) и в Node (module.exports). */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180, STEP = 0.5, NG = 361;   // кривая силы света: γ = 0…180° с шагом 0,5°
  const Z = 1.15;                                       // коэффициент неравномерности

  /* ---------------- Каталог ---------------- */
  let CAT = [], BY = {};
  function setCatalog(list) { CAT = list; BY = {}; for (const x of list) BY[x.a.toUpperCase()] = x; return CAT.length; }
  async function loadCatalog(url) { const r = await fetch(url || 'data/catalog.json'); return setCatalog(await r.json()); }
  const get = a => BY[String(a || '').trim().toUpperCase()] || null;
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const inPrice = x => x && x.p > 0 && x.g !== 'Catalog';

  /** Тип изделия (если в прайсе пусто — из наименования). */
  function kind(x) {
    const t = norm(x.t || x.n);
    const map = [['трековый подвес', 'трековый подвесной'], ['трек', 'трековый'], ['встраив', 'встраиваемый'], ['подвес', 'подвесной'],
      ['бра', 'настенный'], ['настен', 'настенный'], ['потолоч', 'потолочный'], ['накладн', 'накладной'], ['настольн', 'настольный'],
      ['торшер', 'напольный'], ['наполь', 'напольный'], ['ландшафт', 'ландшафтный'], ['лента', 'лента'], ['профил', 'профиль'],
      ['источник напряж', 'блок питания'], ['блок пит', 'блок питания'], ['источник тока', 'драйвер'], ['контроллер', 'контроллер'],
      ['диммер', 'диммер'], ['пульт', 'пульт'], ['шлюз', 'шлюз'], ['датчик', 'датчик'], ['модуль', 'модуль'], ['ламп', 'лампа'],
      ['mr16', 'лампа'], ['шинопровод', 'шинопровод'], ['линейн', 'линейный']];
    for (const [k, v] of map) if (t.includes(k)) return v;
    return t.split(' ')[0] || '';
  }
  function cls(x) {
    if (['Control'].includes(x.g) || ['блок питания', 'драйвер', 'контроллер', 'диммер', 'пульт', 'шлюз', 'датчик'].includes(kind(x))) return 'control';
    if (x.g === 'Voltega' || ['лампа', 'модуль'].includes(kind(x))) return 'source';
    if (x.g === 'Decor' || x.g === 'Outdoor') return 'decor';
    return 'tech';
  }

  /** Поиск по каталогу. q — слова (артикул, серия, тип, цвет…); f — фильтры. */
  function search(q, f = {}, limit = 50) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const res = [];
    for (const x of CAT) {
      if (f.priced && !inPrice(x)) continue;
      if (f.group && x.g !== f.group) continue;
      if (f.kind && kind(x) !== f.kind) continue;
      if (f.cap && norm(x.cap) !== norm(f.cap)) continue;
      if (f.color && !norm(x.col).includes(norm(f.color))) continue;
      if (f.ip && !(parseInt(String(x.ip || '').replace(/\D/g, '')) >= f.ip)) continue;
      if (f.k && !String(x.k || '').includes(String(f.k))) continue;
      if (f.maxPrice && !(x.p <= f.maxPrice)) continue;
      const hay = norm([x.a, x.n, x.se, x.c, x.t, x.col, x.cap, x.k].join(' '));
      let s = 0, ok = true;
      for (const w of words) { if (!hay.includes(w)) { ok = false; break; } s += norm(x.a) === w ? 10 : norm(x.a).startsWith(w) ? 5 : 1; }
      if (!ok) continue;
      if (inPrice(x)) s += 2;
      res.push([s, x]);
    }
    res.sort((a, b) => b[0] - a[0] || (a[1].p || 1e9) - (b[1].p || 1e9));
    return res.slice(0, limit).map(r => r[1]);
  }

  /* ---------------- Нормы (СП 52.13330.2016, прил. Л, на полу) ---------------- */
  const NORMS = [
    { id: 'living', name: 'Гостиная, общая комната', E: 200 }, { id: 'kitchen', name: 'Кухня, кухня-столовая', E: 200 },
    { id: 'bedroom', name: 'Спальня', E: 150 }, { id: 'kids', name: 'Детская', E: 200 }, { id: 'office', name: 'Кабинет, библиотека', E: 300 },
    { id: 'hall', name: 'Коридор, холл, прихожая', E: 100, U0: 0.4 }, { id: 'stairs', name: 'Лестница', E: 100, U0: 0.4 },
    { id: 'bath', name: 'Ванная, санузел, душевая', E: 100, U0: 0.4 }, { id: 'wardrobe', name: 'Гардеробная', E: 100 },
    { id: 'storage', name: 'Кладовая, постирочная', E: 50 }, { id: 'boiler', name: 'Котельная, техпомещение', E: 50 },
    { id: 'gym', name: 'Спортзал (домашний)', E: 200 }, { id: 'garage', name: 'Гараж', E: 50 },
  ];
  function normFor(name) {
    const n = norm(name);
    const rules = [['гост', 'living'], ['столов', 'kitchen'], ['кухн', 'kitchen'], ['спал', 'bedroom'], ['детск', 'kids'], ['кабин', 'office'],
      ['библ', 'office'], ['гардер', 'wardrobe'], ['лестн', 'stairs'], ['с/у', 'bath'], ['сану', 'bath'], ['ванн', 'bath'], ['душ', 'bath'],
      ['туал', 'bath'], ['wc', 'bath'], ['котел', 'boiler'], ['котёл', 'boiler'], ['тех', 'boiler'], ['кладов', 'storage'], ['пост', 'storage'],
      ['гараж', 'garage'], ['спорт', 'gym'], ['трен', 'gym'], ['корид', 'hall'], ['холл', 'hall'], ['прих', 'hall'], ['тамбур', 'hall']];
    for (const [k, id] of rules) if (n.includes(k)) return NORMS.find(x => x.id === id);
    return NORMS[0];
  }

  /* ---------------- Фотометрия ---------------- */
  /** Типовые КСС (как в оценочном калькуляторе Maytoni): I(γ) = A·cos(k·γ). */
  const STD = [[40, 2.7471], [50, 2.3683], [60, 2.0402], [70, 1.7582], [80, 1.5109], [90, 1.2928], [110, 1.1038], [120, 1.0374], [150, 0.7841]];
  function stdK(beam) {
    if (beam <= STD[0][0]) return STD[0][1] * STD[0][0] / Math.max(beam, 10) * 0.6 + STD[0][1] * 0.4;
    for (let i = 1; i < STD.length; i++) if (beam <= STD[i][0]) {
      const [d0, k0] = STD[i - 1], [d1, k1] = STD[i]; return k0 + (k1 - k0) * (beam - d0) / (d1 - d0);
    }
    return STD[STD.length - 1][1];
  }
  /** Кривая силы света для угла рассеивания beam, °. */
  function beamCurve(beam) {
    const k = stdK(beam), full = beam >= 150;
    const c = new Float64Array(NG);
    for (let i = 0; i < NG; i++) { const g = i * STEP; c[i] = !full && g > 90 ? 0 : Math.max(0, Math.cos(k * g * RAD)); }
    return normalize(c);
  }
  function zoneFlux(c, g0, g1) {
    let s = 0;
    for (let i = Math.round(g0 / STEP); i < Math.round(g1 / STEP); i++) {
      const a = i * STEP * RAD, b = (i + 1) * STEP * RAD;
      s += (c[i] * Math.sin(a) + c[i + 1] * Math.sin(b)) / 2 * (b - a);
    }
    return 2 * Math.PI * s;
  }
  /** Нормирует кривую на поток 1 лм (кд/лм). */
  function normalize(c) { const f = zoneFlux(c, 0, 180); return c.map(v => v / f); }
  function intensityAt(c, gDeg) { const x = gDeg / STEP, i = Math.floor(x); if (i >= NG - 1) return c[NG - 1]; return c[i] + (c[i + 1] - c[i]) * (x - i); }
  function fwhm(c) { const m = c[0]; for (let i = 0; i < NG; i++) if (c[i] < m / 2) return 2 * i * STEP; return 180; }

  /** Разбор EULUMDAT (.ldt): средняя по C-плоскостям кривая (кд/лм), LOR, поток ламп. */
  function parseLDT(text) {
    const L = text.split(/\r?\n/).map(s => s.trim());
    const num = i => parseFloat(String(L[i]).replace(',', '.'));
    const Isym = num(2), Mc = num(3), Dc = num(4), Ng = num(5), Dg = num(6);
    const name = L[8], n = num(25);
    let p = 26;
    const lamps = []; for (let k = 0; k < n; k++) { lamps.push({ count: num(p), type: L[p + 1], flux: num(p + 2), cct: L[p + 3], cri: L[p + 4], w: num(p + 5) }); p += 6; }
    p += 10;                                   // коэффициенты прямой доли
    const Cs = []; for (let k = 0; k < Mc; k++) Cs.push(num(p + k)); p += Mc;
    const Gs = []; for (let k = 0; k < Ng; k++) Gs.push(num(p + k)); p += Ng;
    const nStore = Isym === 0 ? Mc : Isym === 1 ? 1 : Isym === 4 ? Math.floor(Mc / 4) + 1 : Math.floor(Mc / 2) + 1;
    const I = []; for (let k = 0; k < nStore; k++) { const row = []; for (let j = 0; j < Ng; j++) row.push(num(p + j)); I.push(row); p += Ng; }
    const mean = Gs.map((_, j) => I.reduce((s, r) => s + r[j], 0) / I.length);
    const c = new Float64Array(NG);
    for (let i = 0; i < NG; i++) {
      const g = i * STEP; let j = 0; while (j < Gs.length - 2 && Gs[j + 1] < g) j++;
      const t = Gs[j + 1] === Gs[j] ? 0 : Math.min(1, Math.max(0, (g - Gs[j]) / (Gs[j + 1] - Gs[j])));
      c[i] = g > Gs[Gs.length - 1] ? 0 : mean[j] + (mean[j + 1] - mean[j]) * t;
    }
    const lampFlux = lamps.reduce((s, l) => s + Math.abs(l.count) * l.flux, 0);
    const raw = zoneFlux(c, 0, 180);                       // кд·ср в единицах таблицы (кд/клм)
    const LOR = num(22) / 100;                             // строка 23 — LOR, %
    const lorCalc = lampFlux > 0 ? raw / 1000 : NaN;       // если таблица в кд/клм — поток светильника на 1 клм лампы
    return { name, lamps, lampFlux, LOR: LOR > 0 && LOR <= 1 ? LOR : (lorCalc > 0 && lorCalc <= 1 ? lorCalc : 1), curve: normalize(c), beam: fwhm(c) };
  }

  /** КПД светильника по типу установки и углу источника (оценка). */
  function lorFor(mount, beam) {
    if (mount === 'deep') return beam <= 45 ? 0.85 : beam <= 65 ? 0.8 : 0.5;           // утопленный (Reif, Dot)
    if (mount === 'shallow') return beam <= 65 ? 0.9 : 0.85;                          // неглубокий (Share, Flint)
    if (mount === 'gx53') return 0.85;
    return 1;                                                                        // открытый / LED со своей КСС
  }
  /** Эффективный угол светильника: в глубоком корпусе широкий источник «обрезается». */
  function beamFor(mount, beam) { return mount === 'deep' && beam > 65 ? 110 : mount === 'gx53' ? 120 : beam; }

  /* ---------------- Оценочный расчёт (метод коэффициента использования) ---------------- */
  const KT = [[1.000, 0, 0, 0, 0, 0], [1.002, 0.2000, 0.9760, 0, 0, 0], [0.9754, 0.2819, 1.274, 0, 0, 0],
    [0.9824, 0.5546, 1.200, 0, 0, 0], [1.310, 0.8119, 1.861, -0.3810, 1.397, 3.176], [0.8718, 1.227, 1.760, 0, 0, 0],
    [0.7384, 4.298, 1.421, 0.2899, 1.964, 6.140], [0.8607, 7.941, 1.895, 0, 0, 0], [0.1663, 716354, 9.470, 0, 0, 0]];
  const kA = (r, phi) => r[0] * Math.exp(-r[1] * Math.pow(phi, -r[2])) + r[3] * Math.exp(-r[4] * Math.pow(phi, -r[5]));
  /** R: {L, W, H, hu?, hr?, rp?, rc?, rr?, E, Ke?}; curve — кд/лм; F — поток светильника (лампа × КПД), лм. */
  function utilization(curve, R) {
    const L = R.L, W = R.W, H = R.H, hu = R.hu ?? H, hr = R.hr ?? 0;
    const rp = R.rp ?? 0.7, rc = R.rc ?? 0.5, rr = R.rr ?? 0.2;
    const h = hu - hr, h0 = H - hu, S = L * W;
    const phi = S / (h * (L + W));
    const xi = 2 * h0 / h / phi;
    const rsr = (rp + rc * xi) / (1 + xi), uf = 1 / (1 + xi);
    const rf = rsr * uf / (1 - rsr * (1 - uf));
    const s = Math.sqrt(1 + 4 * phi * phi);
    const ufr = 1 / (Math.PI * phi * phi) * (2 * phi * s * Math.atan(2 * phi / s) - 2 * phi * Math.atan(2 * phi) + 0.5 * Math.log((1 + 4 * phi * phi) / Math.sqrt(1 + 8 * phi * phi)));
    const gc = 1 / (1 - rc * (1 - phi * (1 - ufr)));
    const q = (1 - ufr) ** 2 * phi / 2;
    const D = 1 - gc * rc * q * (2 * rf * rr * ufr + rf + rr) - rf * rr * ufr * ufr;
    const A = rf * (ufr + gc * rc * q) / D, B = gc * rc * (1 - ufr) * phi / 2 * (1 + rf * ufr) / D, C = (1 - gc * rf * rc * q) / D;
    const Fr = KT.reduce((t, r, i) => t + zoneFlux(curve, 10 * i, 10 * i + 10) * kA(r, phi), 0);
    const Fp = zoneFlux(curve, 0, 180), Ff = zoneFlux(curve, 90, 180), Fc = Fp - (Fr + Ff);
    return { phi, u: (A * Ff + B * Fc + C * Fr) / Fp, S };
  }
  /** Сколько светильников нужно и какая средняя освещённость будет при n штук. */
  function estimate(curve, R, F, n) {
    const { u, phi, S } = utilization(curve, R), Ke = R.Ke ?? 0.8;
    const raw = R.E * S * Z / (u * Ke * F);
    const N = Math.max(1, Math.ceil(raw - 1e-9));
    const Eavg = m => m * F * u * Ke / (S * Z);
    return { u, phi, S, raw, N, E: n != null ? Eavg(n) : Eavg(N), En: Eavg };
  }

  /* ---------------- Раскладка и точечный расчёт ---------------- */
  /** Равномерная раскладка n светильников в прямоугольнике W×L (ряды по длинной стороне). */
  function layout(n, W, L) {
    let best = null;
    for (let r = 1; r <= n; r++) {
      const c = Math.ceil(n / r), dx = W / c, dy = L / r;
      const score = Math.abs(Math.log(dx / dy)) + (r * c - n) * 0.15;
      if (!best || score < best.score) best = { r, c, score };
    }
    const pts = []; let left = n;
    for (let i = 0; i < best.r; i++) {
      const inRow = Math.min(best.c, Math.ceil(left / (best.r - i))); left -= inRow;
      const y = L * (i + 0.5) / best.r;
      for (let j = 0; j < inRow; j++) pts.push([W * (j + 0.5) / inRow, y]);
    }
    return pts;
  }
  /** Точечный расчёт на рабочей плоскости + отражённая составляющая (Сампнер). */
  function pointGrid(R, n, curve, F, opts = {}) {
    const W = R.W, L = R.L, h = (R.hu ?? R.H) - (R.hr ?? 0), Ke = R.Ke ?? 0.8;
    const pts = opts.points || layout(n, W, L);
    const nx = opts.nx || 40, ny = Math.max(4, Math.round(nx * L / W));
    const rp = R.rp ?? 0.7, rc = R.rc ?? 0.5, rr = R.rr ?? 0.2, H = R.H;
    const Sc = W * L, Sw = 2 * (W + L) * H, Stot = 2 * Sc + Sw;
    const rho = (rp * Sc + rc * Sw + rr * Sc) / Stot;
    const Eind = n * F * rho / (Stot * (1 - rho));      // равномерная отражённая
    const grid = new Float64Array(nx * ny); let mn = Infinity, mx = 0, sum = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = W * (i + 0.5) / nx, y = L * (j + 0.5) / ny; let e = 0;
      for (const [px, py] of pts) {
        const d2 = (x - px) ** 2 + (y - py) ** 2, r2 = d2 + h * h;
        const cg = h / Math.sqrt(r2), g = Math.acos(cg) / RAD;
        e += F * intensityAt(curve, g) * cg / r2;
      }
      e = (e + Eind) * Ke; grid[j * nx + i] = e; sum += e; if (e < mn) mn = e; if (e > mx) mx = e;
    }
    const avg = sum / grid.length;
    return { grid, nx, ny, W, L, pts, avg, min: mn, max: mx, U0: mn / avg };
  }
  /** Цвет «фиктивной» шкалы: t = 0…1 (синий → голубой → зелёный → жёлтый → красный). */
  function falseColor(t) {
    t = Math.min(1, Math.max(0, t));
    const st = [[0, [20, 40, 160]], [0.25, [0, 160, 230]], [0.5, [40, 200, 80]], [0.75, [250, 220, 0]], [1, [230, 40, 30]]];
    for (let k = 1; k < st.length; k++) if (t <= st[k][0]) {
      const [t0, a] = st[k - 1], [t1, b] = st[k], u = (t - t0) / (t1 - t0);
      return a.map((v, i) => Math.round(v + (b[i] - v) * u));
    }
    return st[st.length - 1][1];
  }

  /* ---------------- Источники света ---------------- */
  /** Источники для цоколя/типа установки; для утопленных — только ≤ 60°. */
  const SOURCES = {
    GU10: [{ a: '3245', lm: 500, w: 6, ang: 38 }, { a: '3094', lm: 800, w: 8, ang: 38 }, { a: '3097', lm: 1000, w: 10, ang: 38 },
      { a: '3121', lm: 700, w: 7, ang: 60, module: true }, { a: '3123', lm: 700, w: 7, ang: 60, module: true, dim: true }],
    GX53: [{ a: '3137', lm: 800, w: 12, ang: 120, k: 3000 }, { a: '3136', lm: 800, w: 12, ang: 120, k: 2700 }],
  };
  function sourceList(cap) {
    return (SOURCES[String(cap || 'GU10').toUpperCase()] || []).map(s => {
      const x = get(s.a); return Object.assign({}, s, x ? { n: x.n, p: x.p, st: x.st } : {});
    });
  }
  /** Подбор источника и количества.
      fx: {mount:'deep'|'shallow'|'gx53'|'open', cap, curve?, lor?}; R — помещение; opts.existing — кол-во в КП;
      opts.minShare — не меньше доли от КП (0,7); opts.only — 'lamp'|'module'. */
  function pickSource(fx, R, opts = {}) {
    const ex = opts.existing || 0, minN = ex ? Math.ceil(ex * (opts.minShare ?? 0.7)) : 1;
    let list = sourceList(fx.cap);
    if (opts.only === 'lamp') list = list.filter(s => !s.module);
    if (opts.only === 'module') list = list.filter(s => s.module);
    if (fx.mount === 'deep' || fx.mount === 'shallow') list = list.filter(s => s.ang <= 60);
    if (!opts.dimmable) list = list.filter(s => !s.dim);
    const rows = list.map(s => {
      const beam = beamFor(fx.mount, s.ang), lor = fx.lor ?? lorFor(fx.mount, s.ang);
      const curve = fx.curve && s.ang <= 45 ? fx.curve : beamCurve(beam);
      const F = s.lm * lor, est = estimate(curve, R, F);
      const n = Math.max(est.N, minN);
      return { src: s, beam, lor, F, Nreq: est.N, n, E: est.En(n), curve, cost: n * ((fx.p || 0) + (s.p || 0)) };
    });
    if (!rows.length) return null;
    let pick;
    if (ex) {
      const fit = rows.filter(r => r.Nreq <= ex).sort((a, b) => a.src.lm - b.src.lm || a.cost - b.cost);
      pick = fit[0] || rows.slice().sort((a, b) => a.Nreq - b.Nreq || a.cost - b.cost)[0];
    } else pick = rows.slice().sort((a, b) => a.cost - b.cost || a.n - b.n)[0];
    return Object.assign({ options: rows }, pick);
  }

  /* ---------------- Аналоги ---------------- */
  const sizeOf = x => [x.h, x.dm || Math.max(x.l || 0, x.wd || 0)].filter(v => v > 0);
  function rel(a, b) { if (!(a > 0) || !(b > 0)) return null; return 1 - Math.min(1, Math.abs(a - b) / Math.max(a, b)); }
  const kNum = x => parseInt(String(x.k || '').replace(/\D/g, '').slice(0, 4)) || null;
  const ipNum = x => parseInt(String(x.ip || '').replace(/\D/g, '')) || 20;
  const lampsCount = x => { const m = String(x.n || '').match(/(\d+)\s*[*×x]\s*(E14|E27|G9|GU10|GX53|G4|GU5)/i); return m ? +m[1] : null; };
  /** Проверенные замены (встраиваемые под шпаклёвку → под шпаклёвку). */
  const PAIRS = { 'DL048-01W': 'DL042-01-RD-W', 'DL126-GU10-TRS-W': 'DL101-GU10-TRS-W' };
  /** Подбор аналогов по правилам: декор — вид, цвет, размер, форма; техника — поток, угол, мощность, Tцв;
      оборудование — функции и параметры, габариты и вид в последнюю очередь. */
  function analogs(art, limit = 8, opts = {}) {
    const b = typeof art === 'string' ? get(art) : art; if (!b) return { base: null, list: [] };
    const bc = cls(b), bk = kind(b), out = [];
    for (const x of CAT) {
      if (x === b || !inPrice(x)) continue;
      if (opts.sameSeries === false && x.se && x.se === b.se) continue;
      if (bk && kind(x) !== bk) continue;
      const why = []; let s = 0, wsum = 0;
      const add = (w, v, label) => { if (v == null) return; s += w * v; wsum += w; if (label && v >= 0.85) why.push(label); };
      const colEq = b.col ? (!x.col ? 0.4 : norm(x.col) === norm(b.col) ? 1 : norm(x.col).split(/[ /,]/)[0] === norm(b.col).split(/[ /,]/)[0] ? 0.6 : 0) : null;
      const [bh, bd] = sizeOf(b), [xh, xd] = sizeOf(x);
      const size = [rel(bh, xh), rel(bd, xd)].filter(v => v != null);
      const sz = size.length ? size.reduce((p, v) => p + v, 0) / size.length : null;
      if (bc === 'decor') {
        add(30, colEq, 'тот же цвет'); add(25, sz, 'близкий размер');
        add(10, b.cap ? (x.cap === b.cap ? 1 : 0) : null, 'тот же цоколь');
        add(10, lampsCount(b) ? (lampsCount(x) === lampsCount(b) ? 1 : 0.3) : null, 'столько же плафонов');
        add(10, rel(b.w, x.w), 'близкая мощность'); add(5, x.c === b.c ? 1 : 0.5);
      } else if (bc === 'control') {
        add(30, rel(b.w, x.w), 'та же мощность'); add(20, b.v ? ((String(x.v || x.n || '').match(/\d{2,3}(?=\s*[ВV])/) || [])[0] === (String(b.v).match(/\d{2,3}/) || [])[0] ? 1 : 0) : null, 'то же напряжение');
        add(15, b.i ? rel(parseFloat(String(b.i).replace(',', '.')), parseFloat(String(x.i || '').replace(',', '.'))) : null, 'тот же ток');
        const proto = s => new Set(norm(s.n).match(/dali|0-10|triac|zigbee|wi-?fi|\brf\b|knx|pwm/g) || []);
        const pb = proto(b), px = proto(x);
        add(25, pb.size ? [...pb].filter(v => px.has(v)).length / pb.size : null, 'тот же протокол');
        const dt = s => (norm(s.n).match(/dt\s?[68]/) || [''])[0].replace(' ', ''); if (dt(b)) add(25, dt(x) === dt(b) ? 1 : 0, 'тот же тип DALI');
        add(5, ipNum(x) >= ipNum(b) ? 1 : 0); add(5, sz);
      } else {
        add(25, rel(b.lm, x.lm), 'близкий поток'); add(20, b.ang && x.ang ? rel(b.ang, x.ang) : null, 'близкий угол');
        add(15, rel(b.w, x.w), 'близкая мощность'); add(15, kNum(b) ? (kNum(x) === kNum(b) ? 1 : 0) : null, 'та же Tцв');
        add(10, b.cap ? (x.cap === b.cap ? 1 : 0) : null, 'тот же цоколь');
        add(15, colEq, 'тот же цвет'); add(5, ipNum(x) >= ipNum(b) ? 1 : 0, 'IP не ниже'); add(20, sz == null ? 0.5 : sz * sz, 'близкий размер');
        if (b.v) { const vn = s0 => (String(s0 || '').match(/\d{2,3}/) || [])[0]; add(25, vn(x.v || x.n) === vn(b.v) ? 1 : 0, 'то же напряжение'); }
      }
      if (b.shape) { const sq = /-SQ|квадрат/i.test(x.a + ' ' + (x.n || '')); add(10, b.shape === 'квадрат' ? (sq ? 1 : 0) : (sq ? 0 : 1), b.shape === 'квадрат' ? 'квадратный' : 'круглый'); }
      if (b.ipMin && ipNum(x) < b.ipMin) continue;
      if (b.g !== 'Outdoor' && !(b.ipMin >= 44)) add(15, x.g === 'Outdoor' || /уличн/i.test(x.t || '') ? 0 : 1);
      if (!wsum) continue;
      out.push({ item: x, score: Math.round(100 * s / wsum), why });
    }
    const pair = PAIRS[b.a];
    if (pair) { const i = out.findIndex(o => o.item.a === pair); const o = i >= 0 ? out.splice(i, 1)[0] : (get(pair) && { item: get(pair), score: 90, why: [] });
      if (o) { o.why.unshift('проверенная пара'); o.pinned = true; } out.sort((a, b2) => b2.score - a.score || (a.item.p || 0) - (b2.item.p || 0)); if (o) out.unshift(o);
      return { base: b, cls: bc, list: out.slice(0, limit) }; }
    out.sort((a, b2) => b2.score - a.score || (a.item.p || 0) - (b2.item.p || 0));
    return { base: b, cls: bc, list: out.slice(0, limit) };
  }

  /* ---------------- КП ---------------- */
  /** rows: [{room, a, qty, note?}] → строки с ценами и итогом. */
  function priceKP(rows) {
    let total = 0; const missing = [];
    const lines = rows.map(r => {
      const x = get(r.a); const p = x && x.p ? x.p : 0; if (!p) missing.push(r.a);
      const sum = p * (r.qty || 0); total += sum;
      return Object.assign({}, r, { n: x ? x.n : '— нет в каталоге —', p, sum, st: x ? x.st : null });
    });
    return { lines, total, missing };
  }
  /** Экспорт КП в xlsx (нужен SheetJS как XLSX). */
  function kpToXlsx(XLSX, rows, title) {
    const { lines } = priceKP(rows);
    const aoa = [[title || 'Коммерческое предложение'], [], ['Помещение', 'Артикул', 'Наименование', 'Кол-во, шт', 'Цена (РРЦ), ₽', 'Сумма, ₽']];
    lines.forEach((l, i) => { const r = i + 4; aoa.push([l.room || '', l.a, l.n, l.qty, l.p, { f: `D${r}*E${r}` }]); });
    const last = lines.length + 3;
    aoa.push(['Итого', '', '', { f: `SUM(D4:D${last})` }, '', { f: `SUMPRODUCT(D4:D${last},E4:E${last})` }]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 60 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'КП');
    return wb;
  }
  /** Импорт КП из xlsx/xls: ищет строку заголовков с «Артикул» и «Кол». */
  function kpFromSheet(XLSX, wb) {
    const rows = [];
    for (const name of wb.SheetNames) {
      const a = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      let hi = -1, ca = -1, cq = -1, cr = -1;
      for (let i = 0; i < Math.min(a.length, 40) && hi < 0; i++) {
        const r = a[i].map(v => norm(v));
        ca = r.findIndex(v => v.includes('артикул')); cq = r.findIndex(v => v.startsWith('кол'));
        cr = r.findIndex(v => v.includes('помещ') || v.includes('зона') || v.includes('комнат'));
        if (ca >= 0 && cq >= 0) hi = i;
      }
      if (hi < 0) continue;
      let room = '';
      for (let i = hi + 1; i < a.length; i++) {
        const r = a[i], art = String(r[ca] || '').trim(), q = parseFloat(String(r[cq]).replace(',', '.'));
        if (cr >= 0 && String(r[cr]).trim()) room = String(r[cr]).trim();
        if (!art && r.filter(v => String(v).trim()).length === 1) { room = String(r.find(v => String(v).trim())).trim(); continue; }
        if (art && q > 0) rows.push({ room, a: art, qty: q });
      }
    }
    if (!rows.length) for (const name of wb.SheetNames) {           // формат КП из CRM Maytoni: карточки товаров
      const a = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      let room = '', cur = null;
      for (const r of a) {
        const cells = r.map((v, j) => [j, String(v).trim()]).filter(c => c[1]);
        if (!cells.length) continue;
        for (const [j, v] of cells) {
          const q = v.match(/^Кол-во:\s*([\d.,]+)/i);
          if (q && cur) { rows.push({ room, a: cur, qty: parseFloat(q[1].replace(',', '.')) }); cur = null; continue; }
          if (get(v) && !/\s/.test(v)) { cur = get(v).a; continue; }
        }
        if (cells.length === 1 && cells[0][0] <= 2 && !get(cells[0][1]) && !/^(www|коммерч|заказчик|объект|подготов|итого|сумма)/i.test(cells[0][1])) room = cells[0][1];
      }
    }
    return rows;
  }


  /* ---------------- Разбор описания (для подбора аналогов без ИИ) ---------------- */
  const KINDS = [[/трек\w*\s+подвес/i, 'трековый подвесной'], [/трек/i, 'трековый'], [/встраив|врезн|downlight/i, 'встраиваемый'], [/подвес|pendant|люстр/i, 'подвесной'],
    [/(^|[^а-яё])бра([^а-яё]|$)|настен|wall/i, 'настенный'], [/торшер|наполь/i, 'напольный'], [/настольн/i, 'настольный'], [/накладн|surface/i, 'накладной'], [/потолоч|ceiling/i, 'потолочный'],
    [/ландшафт|грунт/i, 'ландшафтный'], [/линейн/i, 'линейный'], [/лент/i, 'лента'], [/профил/i, 'профиль'], [/блок\s*пит|источник\s*напряж|трансформ|power\s*supply/i, 'блок питания'],
    [/драйвер|источник\s*тока/i, 'драйвер'], [/контроллер/i, 'контроллер'], [/диммер/i, 'диммер'], [/пульт/i, 'пульт'], [/шлюз|gateway/i, 'шлюз'], [/датчик/i, 'датчик'],
    [/модул/i, 'модуль'], [/ламп|mr16/i, 'лампа'], [/шинопровод/i, 'шинопровод']];
  const COLS = [[/бел|white/i, 'Белый'], [/ч[её]рн|black/i, 'Черный'], [/золот|gold/i, 'Золото'], [/латун|brass/i, 'Латунь'], [/хром|chrome/i, 'Хром'],
    [/сер(ый|ая|ое|ебр)|grey|gray|silver/i, 'Серый'], [/бронз/i, 'Бронза'], [/мед(ь|н)|copper/i, 'Медь'], [/никел/i, 'Никель']];
  const fnum = v => parseFloat(String(v).replace(',', '.'));
  /** Текст строки (наименование, описание, параметры) → признаки изделия. */
  function parseSpec(text) {
    const t = String(text || ''), sp = { text: t };
    for (const tok of t.split(/[\s;,|]+/)) { const x = tok.length >= 3 && get(tok.replace(/[()]/g, '')); if (x && /\d/.test(tok)) { sp.article = x.a; break; } }
    for (const [re, k] of KINDS) if (re.test(t)) { sp.kind = k; break; }
    for (const [re, c] of COLS) if (re.test(t)) { sp.col = c; break; }
    let m;
    if ((m = t.match(/\b(GU10|GX53|GU5[.,]3|E14|E27|G9|G4|GX70|GU4)\b/i))) sp.cap = m[1].toUpperCase().replace(',', '.');
    else if (/mr16/i.test(t)) sp.cap = 'GU10';
    if ((m = t.match(/(?<![\w-])(\d+(?:[.,]\d+)?)\s*(?:Вт|W)\s*\/\s*м/i))) sp.wpm = fnum(m[1]);
    else if ((m = t.match(/(?<![\w-])(\d+(?:[.,]\d+)?)\s*(?:Вт|W)(?![а-яёa-z])/i))) sp.w = fnum(m[1]);
    if ((m = t.match(/(?<![\w-])(\d{2,6}(?:[.,]\d+)?)\s*(?:лм|lm)(?![а-яёa-z])/i))) sp.lm = fnum(m[1]);
    if ((m = t.match(/(\d{1,3})\s*(?:°|град)/i))) sp.ang = +m[1];
    if ((m = t.match(/(\d{4})\s*(?:K|К)(?![а-яёa-z])/i))) sp.k = m[1];
    if ((m = t.match(/IP\s?(\d{2})/i))) { sp.ip = 'IP' + m[1]; sp.ipMin = +m[1]; }
    if ((m = t.match(/(?:Ø|⌀|D\s*=?|диам\w*\.?)\s*(\d{2,4})/i))) sp.dm = +m[1];
    if ((m = t.match(/(\d{2,4})\s*[x×х*]\s*(\d{2,4})(?:\s*[x×х*]\s*(\d{2,4}))?\s*(?:мм|mm)?/i)) && !/\d\s*[x×*]\s*(E14|E27|G9|GU10)/i.test(m[0])) {
      const a = [m[1], m[2], m[3]].filter(Boolean).map(Number); sp.l = Math.max(...a); sp.h = Math.min(...a); if (a.length === 3) sp.wd = a.sort((p, q) => p - q)[1];
    }
    if ((m = t.match(/(?:H|высот\w*)\s*=?\s*(\d{2,4})/i))) sp.h = +m[1];
    if ((m = t.match(/(\d+)\s*[*×x]\s*(E14|E27|G9|GU10|GX53|G4)/i))) { sp.nl = +m[1]; sp.cap = m[2].toUpperCase(); }
    if ((m = t.match(/(?<![\w,.])(\d{2,3})\s*(?:В|V)(?![а-яёa-z])/i))) sp.v = (+m[1] <= 48 ? 'DC ' : 'AC ') + m[1] + ' В';
    if ((m = t.match(/(?<![\w-])(\d+(?:[.,]\d+)?)\s*шт/i))) sp.qty = fnum(m[1]);
    if (/квадрат|square|\bsq\b/i.test(t)) sp.shape = 'квадрат'; else if (/кругл|round|\brd\b/i.test(t)) sp.shape = 'круг';
    if (/dali|dt8|dt6|0-10|triac|zigbee|wi-?fi|\brf\b|knx|pwm/i.test(t)) sp.proto = (t.match(/dali|dt8|dt6|0-10|triac|zigbee|wi-?fi|\brf\b|knx|pwm/ig) || []).join(' ');
    return sp;
  }
  const specKeys = sp => ['kind', 'col', 'cap', 'w', 'wpm', 'lm', 'ang', 'k', 'ip', 'dm', 'l', 'h', 'nl', 'v', 'shape', 'proto'].filter(k => sp[k] != null);
  /** Аналоги по описанию (если в тексте есть артикул Maytoni — по нему). */
  function analogsBySpec(textOrSpec, limit = 5) {
    const sp = typeof textOrSpec === 'string' ? parseSpec(textOrSpec) : textOrSpec;
    if (sp.article) { const r = analogs(sp.article, limit); r.spec = sp; r.byArticle = true; return r; }
    const ctl = ['блок питания', 'драйвер', 'контроллер', 'диммер', 'пульт', 'шлюз', 'датчик'].includes(sp.kind);
    const dec = ['подвесной', 'настенный', 'напольный', 'настольный', 'потолочный'].includes(sp.kind) && !sp.lm && !sp.ang;
    const base = { a: '(описание)', g: /уличн|outdoor|фасад/i.test(sp.text) ? 'Outdoor' : ctl ? 'Control' : sp.kind === 'лампа' || sp.kind === 'модуль' ? 'Voltega' : dec ? 'Decor' : 'Technical', t: sp.kind || '',
      n: (sp.proto ? sp.proto + ' ' : '') + (sp.nl && sp.cap ? `${sp.nl}*${sp.cap}` : ''), col: sp.col, cap: sp.cap, w: sp.w ?? sp.wpm, lm: sp.lm, ang: sp.ang, k: sp.k, ip: sp.ip,
      dm: sp.dm, l: sp.l, h: sp.h, wd: sp.wd, v: sp.v, shape: sp.shape, ipMin: sp.ipMin };
    if (!specKeys(sp).length) return { base: null, spec: sp, list: [] };
    const r = analogs(base, limit); r.spec = sp; return r;
  }
  /** Таблица (массив строк) → строки описаний для подбора. */
  function sheetToLines(aoa) {
    const HDR = /наимен|артикул|мощн|поток|цвет|кол-?во|тип|описан|цокол|угол|темпер|ip|размер|диаметр|модель|позиц/i;
    let hi = -1;
    for (let i = 0; i < Math.min(aoa.length, 30); i++) if (aoa[i].filter(v => HDR.test(String(v)) && String(v).length < 40).length >= 2) { hi = i; break; }
    const out = [];
    const fmt = (h, v) => { h = String(h || '').toLowerCase(); if (v === '' || v == null) return '';
      if (/кол/.test(h)) return `${v} шт`; if (/мощн|\bвт\b/.test(h) && /^\d/.test(v)) return `${v} Вт`; if (/поток|лм/.test(h) && /^\d/.test(v)) return `${v} лм`;
      if (/угол/.test(h) && /^\d/.test(v)) return `${v}°`; if (/темпер|\bk\b/.test(h) && /^\d{4}/.test(v)) return `${v}K`;
      if (/ip|защит/.test(h) && /^\d{2}$/.test(String(v))) return `IP${v}`; if (/диаметр/.test(h) && /^\d/.test(v)) return `Ø${v}`; return String(v); };
    for (let i = hi + 1; i < aoa.length; i++) {
      const r = aoa[i]; const parts = r.map((v, j) => hi >= 0 ? fmt(aoa[hi][j], v) : String(v)).map(x => String(x).trim()).filter(Boolean);
      if (parts.length >= 2 || (parts.length === 1 && parts[0].length > 12)) out.push(parts.join(' | '));
    }
    return out;
  }

  /* ---------------- Проверка зоны КП ---------------- */
  const FIXTURE_HINTS = [
    { re: /^DL048|reif/i, mount: 'deep', cap: 'GU10' }, { re: /^DL042|dot/i, mount: 'deep', cap: 'GU10' },
    { re: /^DL126|share/i, mount: 'shallow', cap: 'GU10' }, { re: /^DL101|flint/i, mount: 'shallow', cap: 'GU10' },
    { re: /^DL130|orb|GX53/i, mount: 'gx53', cap: 'GX53' }];
  function fixtureProfile(x) {
    const s = (x.a || '') + ' ' + (x.n || '');
    const h = FIXTURE_HINTS.find(f => f.re.test(s));
    if (h) return { mount: h.mount, cap: h.cap, p: x.p };
    const cap = (x.cap || (/(GU10|GX53)/i.exec(x.n || '') || [])[1] || '').toUpperCase();
    return { mount: cap === 'GX53' ? 'gx53' : kind(x) === 'встраиваемый' ? 'deep' : 'open', cap, p: x.p };
  }
  /** Проверка зоны: что даёт текущий комплект и что предложить.
      zone: {name, L, W, H, E?, fixture, n, source?}; варианты: v1 — те же светильники с подбором источника; alt — замена корпуса. */
  function checkZone(zone, opts = {}) {
    const fx = get(zone.fixture) || { a: zone.fixture, n: zone.fixture };
    const pr = fixtureProfile(fx);
    const nr = normFor(zone.name);
    const R = { L: Math.max(zone.L, zone.W), W: Math.min(zone.L, zone.W), H: zone.H || 2.7, E: zone.E || nr.E, Ke: opts.Ke ?? 0.8, rp: 0.7, rc: 0.5, rr: 0.2 };
    let cur = null;
    const src = zone.source ? get(zone.source) : null;
    if (src || zone.lm) {
      const lm = zone.lm || src.lm || 0, ang = zone.ang || src?.ang || (pr.cap === 'GX53' ? 120 : 38);
      const beam = beamFor(pr.mount, ang), lor = lorFor(pr.mount, ang);
      const curve = beamCurve(beam), e = estimate(curve, R, lm * lor, zone.n);
      cur = { lm, ang, beam, lor, Nreq: e.N, E: e.E, ok: e.E >= R.E * 0.98 };
    }
    const v1 = pickSource(pr, R, { existing: zone.n, minShare: opts.minShare ?? 0.7 });
    let alt = null;
    if (opts.alt && opts.alt[pr.mount]) {
      const ax = get(opts.alt[pr.mount]); if (ax) { const ap = fixtureProfile(ax); alt = Object.assign({ fixture: ax.a }, pickSource(ap, R, { existing: zone.n, minShare: opts.minShare ?? 0.7 })); }
    }
    return { zone, R, norm: nr, fixture: fx, profile: pr, cur, v1, alt };
  }

  const MT = { setCatalog, loadCatalog, get, search, kind, cls, inPrice, NORMS, normFor, beamCurve, parseLDT, normalize, zoneFlux, fwhm,
    lorFor, beamFor, utilization, estimate, layout, pointGrid, falseColor, SOURCES, sourceList, pickSource, analogs, priceKP,
    kpToXlsx, kpFromSheet, fixtureProfile, checkZone, parseSpec, analogsBySpec, sheetToLines, get catalog() { return CAT; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = MT; else root.MT = MT;
})(typeof window !== 'undefined' ? window : globalThis);
