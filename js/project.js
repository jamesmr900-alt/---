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
      const rr = this.rowsOf(room).filter(r => r.group === 'Общий свет');
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
