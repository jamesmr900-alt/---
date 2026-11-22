/* Подсказки: вводная карточка на каждой вкладке при первом открытии (для чего, что ввести, что получу, когда пользоваться),
   всплывающие окна при первом наведении на элементы и пошаговый показ. Кнопка «Подсказки» в шапке включает всё заново. */
(function () {
  'use strict';
  const KEY = 'maytoni_help_v1';
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { } };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = document.createElement('style');
  css.textContent = `
  .hint-pop{position:absolute;z-index:50;max-width:300px;background:#17171a;color:#fff;padding:10px 12px;border-radius:9px;font-size:13px;line-height:1.45;box-shadow:0 8px 28px rgba(0,0,0,.25);animation:hintIn .22s ease-out;pointer-events:auto}
  .hint-pop b{color:#e6c88f}.hint-pop .hint-x{float:right;margin:-4px -4px 0 8px;background:none;border:0;color:#aaa;cursor:pointer;font-size:14px}
  .hint-pop .hint-nav{margin-top:8px;display:flex;gap:6px;justify-content:flex-end}.hint-pop .hint-nav button{font:inherit;font-size:12px;border-radius:6px;border:1px solid #555;background:#2a2a2e;color:#fff;padding:3px 9px;cursor:pointer}
  .hint-pop::before{content:'';position:absolute;left:var(--ax,18px);border:7px solid transparent}
  .hint-pop.below::before{top:-14px;border-bottom-color:#17171a}.hint-pop.above::before{bottom:-14px;border-top-color:#17171a}
  .hint-hl{outline:3px solid #b08d57 !important;outline-offset:2px;border-radius:6px}
  @keyframes hintIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .intro{background:#fbf7ee;border:1px solid #efe2c6;border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:14px;animation:hintIn .25s ease-out}
  .intro h4{margin:0 0 8px;font-size:15px}.intro .ig{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  @media(max-width:900px){.intro .ig{grid-template-columns:1fr 1fr}}
  .intro .ig div{background:#fff;border:1px solid #efe2c6;border-radius:8px;padding:8px 10px}.intro .ig b{display:block;font-size:12px;color:#8a6b3b;margin-bottom:3px}
  .intro .row{margin-top:10px}
  .help-btn{background:#2a2a2e !important;color:#e6c88f !important;border-radius:20px;padding:7px 12px;font-size:14px;border:0;cursor:pointer;margin-left:6px}`;
  document.head.appendChild(css);

  const TABS = {}; let curTab = null, pop = null, popTimer = null, tour = null;
  function register(tab, def) { TABS[tab] = def; if (curTab === tab) showIntro(tab); }
  function hide() { if (pop) { pop.remove(); pop = null; } document.querySelectorAll('.hint-hl').forEach(e => e.classList.remove('hint-hl')); clearTimeout(popTimer); }
  function place(el, html, opts = {}) {
    hide(); const r = el.getBoundingClientRect(); if (!r.width && !r.height) return null;
    pop = document.createElement('div'); pop.className = 'hint-pop'; pop.innerHTML = html; document.body.appendChild(pop);
    const pw = pop.offsetWidth, ph = pop.offsetHeight, sx = window.scrollX, sy = window.scrollY;
    let left = Math.min(Math.max(8, r.left + sx), sx + document.documentElement.clientWidth - pw - 8), top = r.bottom + sy + 10, cls = 'below';
    if (r.bottom + ph + 20 > window.innerHeight && r.top > ph + 20) { top = r.top + sy - ph - 10; cls = 'above'; }
    pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.classList.add(cls); pop.style.setProperty('--ax', Math.max(10, Math.min(pw - 24, r.left + sx - left + 12)) + 'px');
    if (opts.hl) el.classList.add('hint-hl');
    const x = pop.querySelector('.hint-x'); if (x) x.onclick = () => { hide(); tour = null; };
    return pop;
  }
  // всплывающие подсказки при первом наведении
  document.addEventListener('mouseover', e => {
    if (tour || !curTab || !TABS[curTab] || !TABS[curTab].tips) return;
    for (const [sel, text] of TABS[curTab].tips) {
      const el = e.target.closest && e.target.closest(sel); if (!el) continue;
      const k = curTab + '|' + sel; if (seen[k]) return;
      seen[k] = 1; save();
      place(el, `<button class="hint-x" title="Закрыть">✕</button>${text}`);
      popTimer = setTimeout(hide, 7000);
      el.addEventListener('mouseleave', () => { clearTimeout(popTimer); popTimer = setTimeout(hide, 1800); }, { once: true });
      return;
    }
  });
  // пошаговый показ
  function startTour(tab) {
    const tips = (TABS[tab] && TABS[tab].tips || []).filter(([sel]) => { const el = document.querySelector(sel); return el && el.getClientRects().length; });
    if (!tips.length) return; tour = { tab, tips, i: 0 }; step();
  }
  function step() {
    if (!tour) return; const [sel, text] = tour.tips[tour.i], el = document.querySelector(sel);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => {
      const p = place(el, `<button class="hint-x" title="Закрыть">✕</button><div class="mute" style="color:#999;font-size:11px;margin-bottom:3px">Подсказка ${tour.i + 1} из ${tour.tips.length}</div>${text}<div class="hint-nav">${tour.i ? '<button data-h="prev">Назад</button>' : ''}<button data-h="next">${tour.i < tour.tips.length - 1 ? 'Дальше' : 'Готово'}</button></div>`, { hl: true });
      if (!p) return;
      p.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { if (b.dataset.h === 'prev') tour.i--; else tour.i++; if (tour.i >= tour.tips.length) { hide(); tour = null; return; } step(); });
    }, 250);
  }
  // вводная карточка
  function showIntro(tab, force) {
    const d = TABS[tab]; if (!d) return;
    const host = d.host ? document.querySelector(d.host) : document.querySelector(`section[data-p="${tab}"]`); if (!host) return;
    host.querySelectorAll(':scope > .intro').forEach(x => x.remove());
    if (seen['intro|' + tab] && !force) return;
    const box = document.createElement('div'); box.className = 'intro';
    box.innerHTML = `<h4>${esc(d.title)}</h4><div class="ig"><div><b>Для чего</b>${d.what}</div><div><b>Что ввести</b>${d.input}</div><div><b>Что получите</b>${d.output}</div><div><b>Когда пользоваться</b>${d.when}</div></div>
      <div class="row"><button class="b sm" data-i="tour">Показать по шагам</button><button class="b ghost sm" data-i="ok">Понятно, скрыть</button></div>`;
    host.prepend(box);
    box.querySelector('[data-i="ok"]').onclick = () => { seen['intro|' + tab] = 1; save(); box.remove(); };
    box.querySelector('[data-i="tour"]').onclick = () => { seen['intro|' + tab] = 1; save(); box.remove(); startTour(tab); };
  }
  function setTab(tab) { curTab = tab; hide(); tour = null; setTimeout(() => showIntro(tab), 60); }
  window.addEventListener('tab-shown', e => setTab(e.detail));
  window.addEventListener('scroll', () => { if (pop && !tour) hide(); }, { passive: true });
  // кнопка в шапке
  function addButton() {
    const nav = document.querySelector('header.top nav'); if (!nav || nav.querySelector('.help-btn')) return;
    const b = document.createElement('button'); b.className = 'help-btn'; b.textContent = '? Подсказки'; b.title = 'Показать описание вкладки и подсказки заново';
    b.onclick = () => { Object.keys(seen).filter(k => k.startsWith(curTab + '|') || k === 'intro|' + curTab).forEach(k => delete seen[k]); save(); showIntro(curTab, true); };
    nav.appendChild(b);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', addButton) : addButton();
  window.HELP = { register, setTab, showIntro, startTour, hide };
})();
