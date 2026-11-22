/* Дополнение вкладки «Проверка КП»: проверка по правилам комплектации и сравнение двух КП. */
(function () {
  'use strict';
  const { $, esc, rub } = MTUI;
  const sec = document.querySelector('section[data-p="chk"]'); if (!sec) return;
  const box = document.createElement('div');
  box.innerHTML = `
  <div class="card"><h3>Проверка по правилам комплектации</h3>
    <div class="row"><button class="b" id="rGo">Проверить текущее КП</button>
      <label class="b ghost" style="display:inline-flex;flex-direction:row;cursor:pointer;color:var(--ink)">или файл КП<input type="file" id="rFile" accept=".xlsx,.xls,.csv" hidden></label>
      <span class="mute">Влажные зоны и IP, лампы к цокольным светильникам, угол ламп в утопленных, модули в накладных, лента и блоки питания, трек одной системы, протоколы, DALI, статусы прайса.</span></div>
    <div id="rOut" style="margin-top:10px"></div></div>
  <div class="card"><h3>Сравнение двух КП</h3>
    <div class="grid g2">
      <label>КП «было»<select id="cmpA"><option value="kp">текущее КП</option><option value="file">из файла…</option></select><input type="file" id="cmpAf" accept=".xlsx,.xls,.csv" hidden></label>
      <label>КП «стало»<select id="cmpB"><option value="file">из файла…</option><option value="kp">текущее КП</option></select><input type="file" id="cmpBf" accept=".xlsx,.xls,.csv" hidden></label>
    </div>
    <div class="row" style="margin-top:8px"><button class="b" id="cmpGo">Сравнить</button><span class="mute" id="cmpMsg"></span></div>
    <div id="cmpOut" style="margin-top:10px"></div></div>`;
  sec.appendChild(box);
  const LV = { error: ['bad', 'ошибка'], warn: ['new', 'внимание'], info: ['', 'заметка'] };
  function showRules(rows) {
    const res = KITS.kpRuleCheck(rows); MTUI.TS.rules = res;
    if (!rows.length) { $('#rOut').innerHTML = '<p class="mute">КП пустое.</p>'; return; }
    if (!res.length) { $('#rOut').innerHTML = '<div class="note">Замечаний нет ✓</div>'; return; }
    const by = {}; res.forEach(r => (by[r.room] = by[r.room] || []).push(r));
    const cnt = l => res.filter(r => r.level === l).length;
    $('#rOut').innerHTML = `<p><span class="pill bad">ошибок: ${cnt('error')}</span> <span class="pill new">внимание: ${cnt('warn')}</span> <span class="pill">заметок: ${cnt('info')}</span></p>` +
      Object.entries(by).map(([room, list]) => `<div style="margin-bottom:8px"><b>${esc(room)}</b><br>${list.sort((a, b) => ['error', 'warn', 'info'].indexOf(a.level) - ['error', 'warn', 'info'].indexOf(b.level)).map(r => `<span class="pill ${LV[r.level][0]}">${LV[r.level][1]}</span> ${esc(r.text)}`).join('<br>')}</div>`).join('');
  }
  $('#rGo').onclick = () => showRules(MTUI.kp.get().rows);
  $('#rFile').onchange = async e => { const f = e.target.files[0]; if (f) showRules(await MTUI.readKPFile(f)); e.target.value = ''; };
  const files = {};
  ['A', 'B'].forEach(k => { $('#cmp' + k).onchange = () => { if ($('#cmp' + k).value === 'file') $('#cmp' + k + 'f').click(); };
    $('#cmp' + k + 'f').onchange = async e => { const f = e.target.files[0]; if (f) { files[k] = { name: f.name, rows: await MTUI.readKPFile(f) }; $('#cmpMsg').textContent = `${k === 'A' ? 'Было' : 'Стало'}: ${f.name} (${files[k].rows.length} строк)`; } }; });
  const src = k => $('#cmp' + k).value === 'kp' ? MTUI.kp.get().rows : files[k] ? files[k].rows : null;
  $('#cmpGo').onclick = () => {
    const A = src('A'), B = src('B');
    if (!A || !B) { $('#cmpMsg').textContent = 'Выберите оба КП (для файла — нажмите и выберите файл).'; if (!B && $('#cmpB').value === 'file') $('#cmpBf').click(); return; }
    const r = KITS.kpCompare(A, B); MTUI.TS.compare = r;
    const tag = { 'добавлено': 'ok', 'убрано': 'bad', 'изменено': 'new', 'без изменений': '' };
    $('#cmpOut').innerHTML = `<div class="kpi" style="margin-bottom:8px"><div><span class="mute">Было</span><b>${rub(r.ta)}</b></div><div><span class="mute">Стало</span><b>${rub(r.tb)}</b></div><div><span class="mute">Разница</span><b style="color:${r.d > 0 ? 'var(--bad)' : 'var(--ok)'}">${r.d > 0 ? '+' : ''}${rub(r.d)}</b></div></div>` +
      '<div class="scroll"><table class="t"><tr><th></th><th>Артикул</th><th>Наименование</th><th class="num">Было, шт</th><th class="num">Стало, шт</th><th class="num">РРЦ</th><th class="num">Разница, ₽</th><th></th></tr>' +
      r.lines.map(l => `<tr><td>${MTUI.img(MT.get(l.a), 34)}</td><td>${esc(l.a)}</td><td>${esc(l.n)}</td><td class="num">${l.qa || '—'}</td><td class="num">${l.qb || '—'}</td><td class="num">${rub(l.p)}</td><td class="num">${l.d ? (l.d > 0 ? '+' : '') + rub(l.d) : '—'}</td><td><span class="pill ${tag[l.status]}">${l.status}</span></td></tr>`).join('') + '</table></div>';
  };
})();
