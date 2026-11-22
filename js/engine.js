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
  const imgOf = x => x && x.i ? 'data/img/' + String(x.a).replace(/[^A-Za-z0-9._-]/g, '_') + '.jpg' : null;
  const inPrice = x => x && x.p > 0 && x.g !== 'Catalog';

  /** Тип устройства: ключевое слово, стоящее раньше всех в наименовании («Диммер RGBW DALI…» → диммер,
      «Встраиваемый светильник…» → встраиваемый, «Светодиодная лента…» → лента). */
  const KIND_RX = [[/кнопочн[а-яё]*\s+(?:настенн[а-яё]*\s+)?панел|роторн[а-яё]*\s+панел|панел[а-яё]*\s+управлени|сенсорн[а-яё]*\s+панел/i, 'панель управления'], [/конвертер/i, 'конвертер'], [/релейн|реле(?:[^а-яё]|$)/i, 'реле'], [/набор\s+для|комплектующ|коннектор|соединител|заглуш|ввод\s*питани|токоподвод|крепл[её]н|монтажн[а-яё]*\s+(?:кольц|короб|рамк)/i, 'комплектующие'],
    [/аксессуар|рассеивател|диффузор|линз[аы]/i, 'аксессуар'], [/шинопровод/i, 'шинопровод'], [/трек\S*\s+подвес/i, 'трековый подвесной'], [/трек/i, 'трековый'],
    [/встраив|врезн/i, 'встраиваемый'], [/подвес|люстр/i, 'подвесной'], [/(?:^|[^а-яё])бра(?:[^а-яё]|$)|настен/i, 'настенный'], [/торшер|наполь/i, 'напольный'],
    [/настольн/i, 'настольный'], [/накладн/i, 'накладной'], [/потолоч/i, 'потолочный'], [/ландшафт|грунт/i, 'ландшафтный'], [/прожектор/i, 'прожектор'],
    [/линейн/i, 'линейный'], [/неон/i, 'неон'], [/(?:^|[^а-яё])лент/i, 'лента'], [/профил/i, 'профиль'],
    [/блок[а-яё]*\s+питани|источник[а-яё]*\s+напряж|трансформатор|power\s*supply/i, 'блок питания'], [/драйвер|источник[а-яё]*\s+тока/i, 'драйвер'],
    [/диммер/i, 'диммер'], [/контроллер/i, 'контроллер'], [/усилител/i, 'усилитель'], [/пульт/i, 'пульт'], [/шлюз|gateway|хаб(?:[^а-яё]|$)/i, 'шлюз'],
    [/датчик/i, 'датчик'], [/выключател/i, 'выключатель'], [/модул/i, 'модуль'], [/ламп|mr16/i, 'лампа']];
  function detectKind(text) {
    let best = null, pos = Infinity; const t = String(text || '');
    for (const [re, k] of KIND_RX) { const m = re.exec(t); if (m && m.index < pos) { pos = m.index; best = k; } }
    return best;
  }
  function kind(x) { return detectKind(x.n) || detectKind(x.t) || ''; }
  const CONTROL_KINDS = ['блок питания', 'драйвер', 'контроллер', 'диммер', 'пульт', 'шлюз', 'датчик', 'усилитель', 'выключатель', 'панель управления', 'конвертер', 'реле'];
  function cls(x) {
    if (['Control'].includes(x.g) || CONTROL_KINDS.includes(kind(x))) return 'control';
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
    const lorF = LOR > 0 && LOR <= 1 ? LOR : (lorCalc > 0 && lorCalc <= 1 ? lorCalc : 1);
    return { format: 'LDT', name, lamps, lampFlux, LOR: lorF, flux: lampFlux * lorF, watts: lamps.reduce((t, l) => t + Math.abs(l.count) * (l.w || 0), 0), curve: normalize(c), beam: fwhm(c) };
  }


  /** Разбор IES (IESNA LM-63): средняя по горизонтальным углам кривая, поток светильника и ламп. */
  function parseIES(text) {
    const lines = text.split(/\r?\n/); let i = 0, name = '';
    for (; i < lines.length; i++) { const l = lines[i].trim(); const m = l.match(/^\[(LUMINAIRE|LUMCAT|TEST|MANUFAC)\]\s*(.*)$/i); if (m && /LUMINAIRE|LUMCAT/i.test(m[1]) && !name) name = m[2].trim(); if (/^TILT\s*=/i.test(l)) break; }
    if (i >= lines.length) throw new Error('не найдено TILT=');
    const tilt = lines[i].split('=')[1].trim().toUpperCase(); i++;
    let tok = lines.slice(i).join(' ').trim().split(/[\s,]+/).filter(Boolean).map(Number), p = 0;
    if (tilt === 'INCLUDE') { p++; const n = tok[p++]; p += 2 * n; }
    const nLamps = tok[p++], lmLamp = tok[p++], mult = tok[p++], nV = tok[p++], nH = tok[p++], ptype = tok[p++]; p += 4; p += 2; const watts = tok[p++];
    const V = tok.slice(p, p + nV); p += nV; const H = tok.slice(p, p + nH); p += nH;
    const I = []; for (let h = 0; h < nH; h++) { I.push(tok.slice(p, p + nV).map(v => v * mult)); p += nV; }
    if (I.length !== nH || I[nH - 1].length !== nV) throw new Error('файл IES обрезан');
    const mean = V.map((_, j) => I.reduce((t, r) => t + r[j], 0) / nH);
    const c = new Float64Array(NG), vmax = V[V.length - 1], vmin = V[0];
    for (let k = 0; k < NG; k++) { const g = k * STEP;
      if (g < vmin || g > vmax) { c[k] = 0; continue; }
      let j = 0; while (j < V.length - 2 && V[j + 1] < g) j++;
      const t = V[j + 1] === V[j] ? 0 : Math.min(1, Math.max(0, (g - V[j]) / (V[j + 1] - V[j]))); c[k] = mean[j] + (mean[j + 1] - mean[j]) * t; }
    const flux = zoneFlux(c, 0, 180), lampFlux = lmLamp > 0 ? nLamps * lmLamp : flux;
    return { format: 'IES', name, lampFlux, LOR: lmLamp > 0 ? Math.min(1, flux / lampFlux) : 1, flux, watts, curve: normalize(c), beam: fwhm(c), type: ptype };
  }
  function parsePhotometry(text, filename) {
    const t = String(text || '');
    if (/\.ies$/i.test(filename || '') || /IESNA|TILT\s*=/i.test(t.slice(0, 4000))) return parseIES(t);
    return parseLDT(t);
  }

  /* ---------------- Библиотека КСС по артикулам ---------------- */
  let PHOT = {};
  const packCurve = c => { const out = []; for (let g = 0; g <= 180; g++) out.push(+(c[g * 2] * 1000).toFixed(3)); return out; };
  const unpackCurve = a => { const c = new Float64Array(NG); for (let k = 0; k < NG; k++) { const g = k * STEP, i = Math.floor(g), t = g - i; c[k] = ((a[i] || 0) + ((a[Math.min(180, i + 1)] || 0) - (a[i] || 0)) * t) / 1000; } return normalize(c); };
  /** Артикул по имени файла: самый длинный артикул каталога, который встречается в имени. */
  function articleFromName(fn) {
    const base = String(fn || '').replace(/\.[a-z0-9]+$/i, '').toUpperCase();
    const norm2 = s => s.replace(/[\s_]+/g, ' ');
    const b = norm2(base); let best = null;
    for (const tok of b.split(/[ ,;()]+/)) { const x = get(tok); if (x && (!best || x.a.length > best.a.length)) best = x; }
    if (best) return best.a;
    for (const x of CAT) { const a = x.a.toUpperCase(); if (a.length >= 4 && b.includes(a) && (!best || a.length > best.a.length)) best = x; }
    return best ? best.a : null;
  }
  function addPhotometry(article, ph, src) {
    PHOT[String(article).toUpperCase()] = { c: packCurve(ph.curve), lor: +(+ph.LOR).toFixed(3), flux: Math.round(ph.flux || 0), lamp: Math.round(ph.lampFlux || 0), beam: Math.round(ph.beam), w: ph.watts || null, name: ph.name || '', src: src || '' };
  }
  function setPhotometry(obj, merge) { PHOT = merge ? Object.assign(PHOT, obj) : (obj || {}); return Object.keys(PHOT).length; }
  function photometryFor(a) {
    const p = PHOT[String(a || '').toUpperCase()]; if (!p) return null;
    if (!p._curve) p._curve = unpackCurve(p.c);
    return { curve: p._curve, LOR: p.lor, flux: p.flux, lampFlux: p.lamp, beam: p.beam, watts: p.w, name: p.name, src: p.src };
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
      const beam = beamFor(fx.mount, s.ang), lor = fx.curve && s.ang <= 45 && fx.lor ? fx.lor : lorFor(fx.mount, s.ang);
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

  /* ---------------- Аналоги ----------------
     Порядок важности: 1) тип устройства — обязателен; 2) функции: протокол управления, цветовой режим (RGBW/RGB/MIX),
     цветовая температура, цоколь, напряжение, каналы, IP, уличное/для помещений; 3) цвет; 4) размеры; дальше мощность, поток, угол.
     Если полного совпадения нет — показываются ближайшие варианты с перечнем отличий. */
  const PAIRS = { 'DL048-01W': 'DL042-01-RD-W', 'DL126-GU10-TRS-W': 'DL101-GU10-TRS-W' };
  const PROTO_RX = [['DALI', /dali|dt\s?[68]/i], ['TRIAC', /triac|симистор|фазов[а-яё]+\s+диммир/i], ['0-10V', /[01]\s*-\s*10\s*(?:в|v)?(?![\d])/i], ['Zigbee', /zigbee/i],
    ['Wi-Fi', /wi-?fi|tuya/i], ['RF', /(?:^|[^a-zа-я])rf(?:[^a-zа-я]|$)|радио/i], ['Bluetooth', /bluetooth|(?:^|[^a-z])ble(?:[^a-z]|$)/i], ['KNX', /knx/i],
    ['PWM', /pwm|шим/i], ['DMX', /dmx/i], ['SPI', /(?:^|[^a-z])spi(?:[^a-z]|$)/i], ['ИК', /(?:^|[^а-я])ик(?:[^а-я]|$)|инфракрас|(?:^|[^a-z])ir(?:[^a-z]|$)/i], ['Push', /push|кнопк/i]];
  const COLS = [[/бел|white/i, 'белый'], [/ч[её]рн|black/i, 'черный'], [/золот|gold/i, 'золото'], [/латун|brass/i, 'латунь'], [/хром|chrome/i, 'хром'],
    [/сер(ый|ая|ое|ебр)|grey|gray|silver/i, 'серый'], [/бронз/i, 'бронза'], [/мед(ь|н)|copper/i, 'медь'], [/никел/i, 'никель'], [/прозрачн/i, 'прозрачный']];
  const colorOf = s0 => { const t = String(s0 || ''), out = []; for (const [re, c] of COLS) { const m = re.exec(t); if (m) out.push([m.index, c]); } return out.sort((p, q) => p[0] - q[0]).map(v => v[1]); };
  const KIND_VOLT = ['лента', 'неон', 'блок питания', 'драйвер', 'контроллер', 'диммер', 'усилитель', 'модуль', 'профиль'];
  /** Признаки изделия (из полей каталога и текста). */
  function features(x, extra) {
    const t = [x.n, x.t, x.k, x.ctl, x.dim === '+' ? '' : '', x.v, extra].filter(Boolean).join(' ');
    const f = { kind: x.kindOverride || kind(x) || detectKind(extra) || '', proto: new Set(), text: t };
    for (const [name, re] of PROTO_RX) if (re.test(t)) f.proto.add(name);
    if (/rgbw|rgb\)?\s*\+\s*w|rgb\)?\s*\+\s*\d{4}/i.test(t)) f.mode = 'RGBW'; else if (/rgb/i.test(t)) f.mode = 'RGB';
    else if (/mix|cct|комбинир|двухцвет|tunable|сменн[а-яё]*\s+цвет|изменяем[а-яё]*\s+цвет|dt\s?8|\d{4}\s*[-–]\s*\d{4}\s*[KК]/i.test(t)) f.mode = 'MIX';
    else if (/одноцвет|монохром|mono/i.test(t)) f.mode = 'одноцветный';
    let m;
    if (f.mode === 'MIX') f.cct = 'сменная'; else if ((m = String(x.k || '').match(/^\d{4}$/)) || (m = t.match(/(\d{4})\s*[KК](?![а-яёa-z])/i))) f.cct = +(m[1] || m[0]);
    f.cap = (x.cap || (t.match(/\b(GU10|GX53|GU5[.,]3|E14|E27|G9|G4|GX70|GU4)\b/i) || [])[1] || (/mr16/i.test(t) ? 'GU10' : '') || '').toUpperCase().replace(',', '.') || null;
    if ((m = t.match(/(одно|двух|тр[её]х|четыр[её]х|пяти|шести)канальн/i))) f.ch = { 'одно': 1, 'двух': 2, 'трех': 3, 'трёх': 3, 'четырех': 4, 'четырёх': 4, 'пяти': 5, 'шести': 6 }[m[1].toLowerCase()];
    else if ((m = t.match(/(\d)\s*-?\s*канал/i))) f.ch = +m[1];
    const vs = (['блок питания', 'драйвер'].includes(f.kind) ? '' : String(x.v || '') + ' ') + t;   // у блоков питания в поле «напряжение» — вход, выход — в наименовании
    if ((m = vs.match(/(?<![\d,.A-Za-zА-Яа-яЁё])(\d{1,3})\s*(?:-\s*(\d{2,3})\s*)?(?:В|V)(?![а-яёА-ЯЁa-zA-Z])/))) { const lo = +m[1], hi = +(m[2] || m[1]); const n0 = v => v >= 200 ? 230 : v; f.volt = { lo: n0(lo), hi: n0(hi) }; }
    f.col = colorOf(x.col)[0] || colorOf(x.n)[0] || colorOf(extra)[0] || null;
    f.ip = parseInt(String(x.ip || (t.match(/IP\s?(\d{2})/i) || [])[1] || '').replace(/\D/g, '')) || null;
    f.out = x.g === 'Outdoor' || /уличн|ландшафт|фасад/i.test(t);
    f.h = x.h; f.d = x.dm || (x.l && x.wd ? Math.max(x.l, x.wd) : x.l); f.w = x.w; f.lm = x.lm; f.ang = x.ang;
    f.nl = x.nl || (((x.n || '').match(/(\d+)\s*[*×x]\s*(E14|E27|G9|GU10|GX53|G4)/i) || [])[1] | 0) || null;
    return f;
  }
  const rel = (a, b) => (a > 0 && b > 0) ? Math.abs(a - b) / Math.max(a, b) : null;
  const COLFAM = { 'золото': 'тёплый металл', 'латунь': 'тёплый металл', 'бронза': 'тёплый металл', 'медь': 'тёплый металл', 'хром': 'холодный металл', 'никель': 'холодный металл', 'серый': 'холодный металл' };
  /** Сравнение кандидата с образцом: критичные отличия, мелкие отличия, совпадения, баллы. */
  function compare(B, C, cItem) {
    const hard = [], soft = [], why = []; let pen = 0;
    const SURF = ['накладной', 'потолочный'];
    const kindOk = C.kind === B.kind || (['лампа', 'модуль'].includes(B.kind) && ['лампа', 'модуль'].includes(C.kind)) || (SURF.includes(B.kind) && SURF.includes(C.kind));
    if (!kindOk) return null;
    if (SURF.includes(B.kind) && C.kind !== B.kind) why.push('в каталоге — ' + C.kind);
    if (B.kind !== C.kind && !SURF.includes(B.kind)) { soft.push(C.kind === 'модуль' ? 'модуль вместо лампы — только для встраиваемых светильников' : 'лампа вместо модуля'); pen += 5; }
    const KEYP = [...B.proto].filter(p => !['PWM', 'Push', 'ИК'].includes(p));   // ШИМ, кнопка, ИК — не протокол управления
    if (KEYP.length) {
      const miss = KEYP.filter(p => !C.proto.has(p));
      if (miss.length) { hard.push(`управление: ${C.proto.size ? [...C.proto].join(', ') : 'не указано'} вместо ${KEYP.join(', ')}`); pen += 40; } else why.push('управление ' + KEYP.join(', '));
    }
    if (B.mode) { if (C.mode !== B.mode) { hard.push(`цвет свечения: ${C.mode || 'не указан'} вместо ${B.mode}`); pen += 35; } else why.push(B.mode); }
    if (B.cct && !(C.cct == null && C.cap)) {
      const ok = B.cct === 'сменная' ? C.cct === 'сменная' : (typeof C.cct === 'number' && Math.abs(C.cct - B.cct) <= 100);
      if (!ok) { hard.push(`Tцв ${C.cct ? C.cct + (typeof C.cct === 'number' ? 'K' : '') : 'не указана'} вместо ${B.cct}${typeof B.cct === 'number' ? 'K' : ''}`); pen += 30; } else why.push('Tцв ' + B.cct + (typeof B.cct === 'number' ? 'K' : ''));
    }
    if (B.cap && B.kind !== 'модуль') {
      const modOk = B.kind === 'лампа' && C.kind === 'модуль' && B.cap === 'GU10';
      if (C.cap !== B.cap && !modOk) { hard.push(C.cap ? `цоколь ${C.cap} вместо ${B.cap}` : `встроенный LED вместо цоколя ${B.cap}`); pen += 30; } else if (C.cap === B.cap) why.push('цоколь ' + B.cap);
    }
    if (B.volt && KIND_VOLT.includes(B.kind)) { const vt = v => v.lo === v.hi ? v.lo + ' В' : v.lo + '–' + v.hi + ' В';
      if (!C.volt || C.volt.lo > B.volt.lo || C.volt.hi < B.volt.hi) { hard.push(`напряжение ${C.volt ? vt(C.volt) : 'не указано'} вместо ${vt(B.volt)}`); pen += 30; } else why.push(vt(C.volt)); }
    if (B.ch) { if (C.ch && C.ch !== B.ch) { hard.push(`каналов ${C.ch} вместо ${B.ch}`); pen += 15; } else if (C.ch === B.ch) why.push(B.ch + '-канальный'); }
    if (B.out !== C.out && (B.out || C.out)) { hard.push(C.out ? 'уличный (для помещений не нужен)' : 'для помещений, не уличный'); pen += 25; }
    if (B.ip && (C.ip || 20) < B.ip) { hard.push(`IP${C.ip || 20} ниже IP${B.ip}`); pen += 20; }
    // 3) цвет
    if (B.col) {
      if (C.col === B.col) why.push('цвет ' + B.col);
      else if (C.col && COLFAM[C.col] && COLFAM[C.col] === COLFAM[B.col]) { soft.push(`цвет ${C.col} вместо ${B.col}`); pen += 6; }
      else { soft.push(`цвет ${C.col || 'не указан'} вместо ${B.col}`); pen += 15; }
    }
    // 4) размеры
    const rs = [rel(B.d, C.d), rel(B.h, C.h)].filter(v => v != null);
    if (rs.length) { const r = rs.reduce((p, v) => p + v, 0) / rs.length; pen += 15 * Math.min(1, r * 2);
      if (r > 0.2) soft.push(`размер отличается ~на ${Math.round(r * 100)}%${C.d || C.h ? ` (${[C.d, C.h].filter(Boolean).join('×')} мм)` : ''}`); else why.push('близкий размер'); }
    // прочее
    if (B.w) { const r = rel(B.w, C.w);
      if (B.kind === 'блок питания' || B.kind === 'драйвер') { if (C.w && C.w < B.w) { soft.push(`мощность ${C.w} Вт меньше ${B.w} Вт`); pen += 20; } else if (r != null) { pen += 8 * Math.min(1, r * 2); if (r <= 0.05) why.push(B.w + ' Вт'); else soft.push(`мощность ${C.w} Вт (запас)`); } }
      else if (r != null) { pen += 10 * Math.min(1, r * 2); if (r > 0.3) soft.push(`мощность ${C.w} Вт вместо ${B.w} Вт`); } }
    if (B.lm) { const r = rel(B.lm, C.lm); if (r != null) { pen += 10 * Math.min(1, r * 2); if (r > 0.25) soft.push(`поток ${C.lm} лм вместо ${B.lm} лм`); else why.push('близкий поток'); } }
    if (B.ang) { const r = rel(B.ang, C.ang); if (r != null) { pen += 8 * Math.min(1, r * 2); if (r > 0.3) soft.push(`угол ${C.ang}° вместо ${B.ang}°`); } }
    if (B.nl && C.nl && B.nl !== C.nl) { soft.push(`плафонов ${C.nl} вместо ${B.nl}`); pen += 5; }
    if (B.shape) { const sq = /-SQ|квадрат/i.test((cItem.a || '') + ' ' + (cItem.n || '')); if ((B.shape === 'квадрат') !== sq) { soft.push(sq ? 'квадратный' : 'круглый'); pen += 8; } }
    return { hard, soft, why, score: Math.max(0, Math.round(100 - pen)) };
  }
  /** Аналоги изделия из каталога (артикул) или образца {kindOverride, …}. */
  function analogs(art, limit = 8, opts = {}) {
    const b = typeof art === 'string' ? get(art) : art; if (!b) return { base: null, list: [] };
    const B = b.__f || features(b);
    if (!B.kind) return { base: b, list: [], note: 'Не удалось определить тип устройства. Начните описание с типа: «Диммер …», «Светильник встраиваемый …», «Лента …».' };
    const out = [];
    for (const x of CAT) {
      if (x === b || x.a === b.a || !inPrice(x)) continue;
      if (opts.sameSeries === false && x.se && x.se === b.se) continue;
      const C = features(x); const r = compare(B, C, x); if (!r) continue;
      out.push(Object.assign({ item: x }, r));
    }
    out.sort((p, q) => p.hard.length - q.hard.length || q.score - p.score || (p.item.p || 0) - (q.item.p || 0));
    const pair = PAIRS[b.a]; if (pair) { const i = out.findIndex(o => o.item.a === pair); if (i > 0) { const o = out.splice(i, 1)[0]; o.why.unshift('проверенная пара'); out.unshift(o); } }
    const list = out.slice(0, limit).map(o => Object.assign(o, { exact: !o.hard.length && !o.soft.some(d => d.startsWith('цвет')) }));
    let note = '';
    if (!out.length) note = `В прайсе Maytoni нет изделий типа «${B.kind}».`;
    else if (!list[0].exact) note = list[0].hard.length ? 'Полного аналога нет. Ближайшие варианты — отличия указаны.' : 'Аналог по функциям есть, но с отличиями по виду или размеру — указаны ниже.';
    return { base: b, cls: cls(b), kind: B.kind, features: { protocol: [...B.proto], mode: B.mode, cct: B.cct, cap: B.cap, volt: B.volt ? (B.volt.lo === B.volt.hi ? B.volt.lo : B.volt.lo + '-' + B.volt.hi) : undefined, color: B.col }, list, note,
      why: undefined, get score() { return list[0] ? list[0].score : 0; } };
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
  const fnum = v => parseFloat(String(v).replace(',', '.'));
  /** Текст строки (наименование, описание, параметры) → признаки изделия. */
  function parseSpec(text) {
    const t = String(text || ''), sp = { text: t };
    for (const tok of t.split(/[\s;,|]+/)) { const x = tok.length >= 3 && get(tok.replace(/[()]/g, '')); if (x && /\d/.test(tok)) { sp.article = x.a; break; } }
    sp.kind = detectKind(t) || undefined;
    sp.col = colorOf(t)[0];
    let m;
    if ((m = t.match(/\b(GU10|GX53|GU5[.,]3|E14|E27|G9|G4|GX70|GU4)\b/i))) sp.cap = m[1].toUpperCase().replace(',', '.');
    else if (/mr16/i.test(t)) sp.cap = 'GU10';
    if ((m = t.match(/(?<![\w-])(\d+(?:[.,]\d+)?)\s*(?:Вт|W)\s*\/\s*м/i))) sp.wpm = fnum(m[1]);
    else if ((m = t.match(/(?<![\w-])(\d+(?:[.,]\d+)?)\s*(?:Вт|W)(?![а-яёa-z])/i))) sp.w = fnum(m[1]);
    if ((m = t.match(/(?<![\w-])(\d{2,6}(?:[.,]\d+)?)\s*(?:лм|lm)(?![а-яёa-z])/i))) sp.lm = fnum(m[1]);
    if ((m = t.match(/(\d{1,3})\s*(?:°|град)/i))) sp.ang = +m[1];
    if ((m = t.match(/(\d{4})\s*(?:K|К)(?![а-яёa-z])/i))) sp.k = m[1];
    if ((m = t.match(/IP\s?(\d{2})/i))) { sp.ip = 'IP' + m[1]; sp.ipMin = +m[1]; }
    if ((m = t.match(/(?:Ø|⌀|D\s*=?|диам[а-яё]*\.?)\s*(\d{2,4})/i))) sp.dm = +m[1];
    if ((m = t.match(/(\d{2,4})\s*[x×х*]\s*(\d{2,4})(?:\s*[x×х*]\s*(\d{2,4}))?\s*(?:мм|mm)?/i)) && !/\d\s*[x×*]\s*(E14|E27|G9|GU10)/i.test(m[0])) {
      const a = [m[1], m[2], m[3]].filter(Boolean).map(Number); sp.l = Math.max(...a); sp.h = Math.min(...a); if (a.length === 3) sp.wd = a.sort((p, q) => p - q)[1];
    }
    if ((m = t.match(/(?:H|высот[а-яё]*)\s*=?\s*(\d{2,4})/i))) sp.h = +m[1];
    if ((m = t.match(/(\d+)\s*[*×x]\s*(E14|E27|G9|GU10|GX53|G4)/i))) { sp.nl = +m[1]; sp.cap = m[2].toUpperCase(); }
    if ((m = t.match(/(?<![\d,.A-Za-zА-Яа-яЁё])(\d{1,3})\s*(?:-\s*(\d{2,3})\s*)?(?:В|V)(?![а-яёА-ЯЁa-zA-Z])/))) sp.v = (+(m[2] || m[1]) <= 48 ? 'DC ' : 'AC ') + m[1] + (m[2] ? '–' + m[2] : '') + ' В';
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
    const t = sp.text || '';
    const base = { a: '(описание)', n: t, g: /уличн|outdoor|фасад|ландшафт/i.test(t) ? 'Outdoor' : 'Technical', col: sp.col, cap: sp.cap, w: sp.w ?? sp.wpm, lm: sp.lm, ang: sp.ang,
      ip: sp.ip, dm: sp.dm, l: sp.l, h: sp.h, wd: sp.wd, nl: sp.nl };
    const F = features(base); F.kind = sp.kind || ''; F.shape = sp.shape; if (sp.dm || sp.l) F.d = sp.dm || sp.l;
    base.__f = F;
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

  const MT = { parseIES, parsePhotometry, articleFromName, addPhotometry, setPhotometry, photometryFor, get photometry() { return PHOT; }, imgOf, detectKind, features, setCatalog, loadCatalog, get, search, kind, cls, inPrice, NORMS, normFor, beamCurve, parseLDT, normalize, zoneFlux, fwhm,
    lorFor, beamFor, utilization, estimate, layout, pointGrid, falseColor, SOURCES, sourceList, pickSource, analogs, priceKP,
    kpToXlsx, kpFromSheet, fixtureProfile, checkZone, parseSpec, analogsBySpec, sheetToLines, get catalog() { return CAT; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = MT; else root.MT = MT;
})(typeof window !== 'undefined' ? window : globalThis);
