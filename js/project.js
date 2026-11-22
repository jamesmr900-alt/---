/* Рабочий вариант проекта: одно место, откуда КП, светорасчёт, план и 3D берут помещения, артикулы и количество.
   Любое изменение (замена модели, применение светорасчёта) пересобирает всё автоматически. */
(function () {
  'use strict';
  const TS = MTUI.TS;
  const KEY = 'maytoni_project_v1';
  const subs = [];
  const P = {
    get data() { return TS.project || null; },
    /** rooms — вводные помещений (как в «Подборе с нуля»), rows — строки варианта {room, a, qty, note, group}. */
    set(rooms, rows, variant, glob) { TS.project = { variant: variant || '', glob: glob || {}, rooms: JSON.parse(JSON.stringify(rooms)), rows: rows.map(r => Object.assign({}, r)) }; this.sync(); },
    rowsOf(room) { return this.data ? this.data.rows.filter(r => r.room === room) : []; },
    roomOf(name) { return this.data ? this.data.rooms.find(r => r.name === name) : null; },
    /** Общий свет помещения: светильник, источник (если есть), количество. */
    generalOf(room) {
      let rr = this.rowsOf(room).filter(r => r.group === 'Общий свет');
      if (!rr.some(r => MT.cls(MT.get(r.a) || {}) !== 'source')) rr = this.rowsOf(room).filter(r => /^Трек/.test(r.group || '') && ['трековый', 'трековый подвесной'].includes(MT.kind(MT.get(r.a) || {})));
      const fx = rr.find(r => { const x = MT.get(r.a); return x && MT.cls(x) !== 'source'; }), src = rr.find(r => { const x = MT.get(r.a); return x && MT.cls(x) === 'source'; });
      return fx ? { fixture: fx.a, qty: fx.qty, source: src ? src.a : null } : null;
    },
    replace(room, oldA, newA) { if (!this.data) return; this.data.rows.forEach(r => { if (r.room === room && r.a === oldA) { r.a = newA; r.note = (r.note ? r.note + '; ' : '') + 'заменено'; } }); this.sync(); },
    /** Результат светорасчёта → в проект: модель, источник и количество общего света помещения. */
    applyCalc(room, fixture, source, n) {
      if (!this.data) return false;
      const rows = this.data.rows, idx = rows.findIndex(r => r.room === room && r.group === 'Общий свет' && MT.cls(MT.get(r.a) || {}) !== 'source');
      const base = { room, group: 'Общий свет' };
      if (idx >= 0) Object.assign(rows[idx], { a: fixture, qty: n, note: 'общий свет — по светорасчёту' }); else rows.push(Object.assign({ a: fixture, qty: n, note: 'общий свет — по светорасчёту' }, base));
      const si = rows.findIndex(r => r.room === room && r.group === 'Общий свет' && MT.cls(MT.get(r.a) || {}) === 'source');
      if (source && MT.get(source)) { if (si >= 0) Object.assign(rows[si], { a: source, qty: n }); else rows.splice(rows.indexOf(rows.find(r => r.room === room && r.a === fixture)) + 1, 0, Object.assign({ a: source, qty: n, note: '' }, base)); }
      else if (si >= 0) rows.splice(si, 1);
      this.sync(); return true;
    },
    /** План помещения → проект: количество светильников по артикулам, ленты и шинопровод по длине. Лампы следуют за светильниками. */
    fromPlan(plan) {
      const name = plan.name, lg = (window.PLANNER && PLANNER.legendOf) ? PLANNER.legendOf(plan).filter(l => l.a && MT.get(l.a)) : [];
      if (!this.data) TS.project = { variant: 'по плану', glob: {}, rooms: [], rows: [] };
      const d = this.data;
      if (!d.rooms.some(r => r.name === name)) d.rooms.push({ name, L: plan.L, W: plan.W, H: plan.H });
      const rows = d.rows, mine = rows.filter(r => r.room === name);
      const placeable = x => x && x.g !== 'Voltum' && MT.cls(x) !== 'source' && MT.cls(x) !== 'control' && !['блок питания', 'профиль', 'комплектующие', 'аксессуар', 'контроллер', 'пульт', 'диммер', 'шлюз', 'датчик', 'драйвер', 'реле'].includes(MT.kind(x));
      const before = new Map(); mine.forEach(r => before.set(r.a, (before.get(r.a) || 0) + r.qty));
      const groupOf = a => { const it = plan.items.find(i => i.a === a); return it && it.group ? it.group : 'Общий свет'; };
      const want = new Map();
      for (const l of lg) {
        const x = MT.get(l.a), k = MT.kind(x);
        if (l.key.startsWith('line')) {
          const unit = (x.l || (k === 'лента' ? 5000 : 1000)) / 1000;
          want.set(l.a, { qty: Math.max(1, Math.ceil(l.len / unit - 0.05)), note: `${l.len.toFixed(1)} м по плану`, line: true });
        } else want.set(l.a, { qty: l.n });
      }
      // убрать с проекта то, что удалено с плана
      for (let i = rows.length - 1; i >= 0; i--) { const r = rows[i]; if (r.room !== name) continue; const x = MT.get(r.a);
        if (placeable(x) && !want.has(r.a)) rows.splice(i, 1); }
      // количества
      for (const [a, w] of want) {
        const rr = rows.filter(r => r.room === name && r.a === a);
        if (rr.length) { const old = rr.reduce((t, r) => t + r.qty, 0);
          if (w.line && Math.abs(old - w.qty) <= 0) continue;
          rr[0].qty = w.qty; if (w.note) rr[0].note = w.note; for (let j = 1; j < rr.length; j++) rows.splice(rows.indexOf(rr[j]), 1); }
        else rows.push({ room: name, a, qty: w.qty, group: groupOf(a), note: w.note || 'расставлено на плане' });
      }
      // лампы: столько же на светильник, сколько было
      for (let i = 0; i < rows.length; i++) { const r = rows[i]; if (r.room !== name || MT.cls(MT.get(r.a) || {}) !== 'source') continue;
        let j = i - 1; while (j >= 0 && (rows[j].room !== name || MT.cls(MT.get(rows[j].a) || {}) === 'source')) j--;
        if (j < 0) continue; const f = rows[j], was = before.get(f.a) || f.qty, per = was ? Math.max(1, Math.round((before.get(r.a) || r.qty) / was)) : 1;
        r.qty = f.qty * per; }
      d.rows = rows.filter(r => r.qty > 0);
      this.sync();
      if (window.MTUI && MTUI.toast) MTUI.toast(`План «${name}» → проект и КП обновлены`);
    },
    /** Пересобрать КП, планы, расчёты. */
    sync() {
      const d = this.data; if (!d) return;
      MTUI.kp.set(d.rows.map(r => ({ room: r.room, a: r.a, qty: r.qty })), `КП — ${d.variant || 'рабочий вариант'}`);
      // светорасчёты по помещениям (с картами для отчёта)
      TS.calcs = (TS.calcs || []).filter(c => !d.rooms.some(r => r.name === c.summary.room));
      for (const room of d.rooms) {
        const g = this.generalOf(room.name); if (!g) continue;
        try {
          let L = +room.L, W = +room.W; if (!(L > 0 && W > 0) && room.S > 0) { L = Math.sqrt(room.S * 1.3); W = room.S / L; }
          const c = MTUI.roomCalc({ room: room.name, L, W, H: room.H || 2.75, fixture: g.fixture, source: g.source || undefined, existing: g.qty });
          const cv = document.createElement('canvas'); MTUI.drawMap(cv, c, room.name);
          TS.calcs.push({ summary: c.summary, png: cv.toDataURL('image/png'), project: true });
          room._calc = { E: Math.round(c.pick.E), ok: c.ok, norm: c.R.E };
        } catch (e) { room._calc = null; }
      }
      // планы помещений
      if (window.PLANNER) for (const room of d.rooms) window.PLANNER.syncRoom(room, this.rowsOf(room.name));
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { }
      subs.forEach(f => { try { f(d); } catch (e) { console.warn(e); } });
    },
    on(f) { subs.push(f); },
    clear() { TS.project = null; try { localStorage.removeItem(KEY); } catch (e) { } subs.forEach(f => f(null)); },
    restore() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.rooms) { TS.project = d; subs.forEach(f => f(d)); } } catch (e) { } },
  };
  window.PROJECT = P;
})();
