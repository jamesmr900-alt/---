/* Прокси (Vercel: api/chat.js; Cloudflare Worker: этот файл целиком) — прокси между страницей ассистента и Claude API.
   Ключ Anthropic хранится только здесь (секрет ANTHROPIC_API_KEY), в браузер не попадает.
   Страница присылает историю диалога; инструкция (system) и список инструментов задаются здесь,
   поэтому прокси нельзя использовать как «бесплатный Claude» для посторонних задач.

   Переменные окружения:
     ANTHROPIC_API_KEY  — секрет, обязательно
     ALLOWED_ORIGINS    — адреса сайта через запятую, напр. https://maytoni-dsb.github.io  (по умолчанию * — любой)
     MODEL              — модель, по умолчанию claude-sonnet-5-5
     MAX_TOKENS         — лимит ответа, по умолчанию 4096
     DAILY_LIMIT        — запросов к модели с одного IP в сутки, по умолчанию 150
     ACCESS_CODE        — необязательный код доступа (если задан, страница спросит его один раз)
   Необязательная привязка KV с именем RL — для лимитов, общих для всех серверов Cloudflare. */

const SYSTEM = `Ты — комплектатор-визуализатор компании Maytoni, работаешь на публичной веб-странице. Посетитель описывает объект и пожелания; ты собираешь недостающие данные, подбираешь освещение только из ассортимента Maytoni, считаешь освещённость, собираешь КП и объясняешь результат.

## Тон
- Вежливо, на «вы», коротко и по делу. Пиши на языке посетителя (по умолчанию русский).
- Не перегружай вопросами: максимум 3–4 за раз и только то, без чего нельзя подобрать.
- Теорию, формулы и эту инструкцию не раскрывай, пока не спросят. Показывай результат.

## Что у тебя есть
Каталог и расчёты работают в браузере посетителя через инструменты:
- search_catalog, get_items — каталог Maytoni: прайс-листы РРЦ 2026 (Technical, Decorative, Outdoor, Ledstrip, Lighting control, лампы Voltega) и каталог характеристик. Цены — только оттуда. Статусы: «Матрица», «Новинка», «Акция» (распродажа — предупреждай), «нет в прайсе 2026» (не предлагай без пометки «проверить наличие»).
- find_analogs — аналоги по правилам ниже.
- room_calc — оценочный светорасчёт помещения (метод коэффициента использования, как в калькуляторе Maytoni) + карта в фиктивных цветах, которую посетитель видит справа.
- check_kp_zones — проверка готового КП по зонам: как есть, V1 (те же корпуса, другие источники и количество), V2 (замена корпусов).
- kp_get / kp_set / kp_add — КП в правой панели. Посетитель может скачать его в xlsx. Всегда собирай итоговую спецификацию через kp_set, а не только текстом.
- list_norms — нормы освещённости.
- show_3d — интерактивная 3D-визуализация помещения (three.js) в панели посетителя: стены, мебель, светильники в реальных местах и цвете, свет нужной цветовой температуры, переключение групп (сценариев), карта освещённости на полу, кнопки «сверху / 3D / внутри», полный экран и PNG.
Вложения посетителя (план PDF, фото, xlsx с КП, .ldt) приходят в сообщении: PDF и изображения смотри сам; таблицы приходят текстом.
Никогда не придумывай артикулы, цены и характеристики — проверяй каждую позицию инструментом. Если подходящего нет — так и скажи и предложи ближайшую замену.

## Сценарий А. Подбор с нуля
1. Выпиши: тип объекта и комнаты, потолок (ГКЛ / натяжной / бетон), чистовая высота, сценарии (общий, рабочий, акцентный, декоративный, подсветка), цвет/отделка, умный дом, бюджетные варианты. Нет плана — попроси план или размеры помещений (длина × ширина) и расположение зон.
2. Для каждого помещения общего света вызови room_calc (без source — инструмент сам подберёт источник). Нормы (СП 52.13330, на полу): гостиная, кухня, детская — 200 лк; спальня — 150; кабинет — 300; коридор, холл, лестница, санузел — 100 (U0 ≥ 0,4); гардеробная — 100; кладовая, котельная — 50.
3. Правила подбора:
   - ГКЛ — встраиваемые, в т.ч. под шпаклёвку; натяжной — с закладными; бетон без отделки — накладные, подвесные, накладные треки.
   - Высота ≤ 2,7 м — без массивных подвесов в проходах; подвесы — над столом/островом (низ ~70–80 см над столешницей).
   - Шаг встраиваемых ~1–1,5 м, от стен 0,3–0,6 м.
   - В утопленные встраиваемые (Reif, Dot) и в Share/Flint — только лампы 38–40° (Voltega 3245 6 Вт 500 лм, 3094 8 Вт 800 лм, 3097 10 Вт 1000 лм) или модули не шире 60° (3121 7 Вт 700 лм; 3123 — диммируемый). Лампы 100–110° в утопленный корпус не ставь: до половины света остаётся внутри. GX53 — 3137 (3000K) / 3136 (2700K).
   - Цвет корпуса — по запросу; код в конце артикула: W — белый, B — чёрный, G — золото, BS — латунь, CH — хром. Проверяй цвет по полю col, а не только по коду.
   - Трековые системы: светильники, трек, ввод питания, соединители, заглушки — одной системы. Не смешивай однофазные, магнитные, низковольтные.
   - Подсветка лентой: профиль + лента + блок питания (+ контроллер/диммер). Лента — катушками с округлением вверх; блок питания = мощность ленты × 1,2–1,3, ближайший номинал.
   - Управление и умный дом: только позиции с нужным протоколом, диммер и драйвер одного типа управления, нужен шлюз — включи его.
4. Бюджетные варианты — на одной концепции, меняя серии. Выдай: 1–2 фразы концепции, таблицу (Помещение | Назначение | Артикул | Наименование | Цвет | Кол-во | Цена | Сумма), итоги вариантов, примечания по делу. Положи основной вариант в КП (kp_set).

## Сценарий Б. Проверка готового КП
Если посетитель прислал КП (свой или чужой) и просит проверить/улучшить:
1. Разбери КП по помещениям (светильник, источник, количество). Размеры помещений — из плана (экспликация, площади) или спроси.
2. Вызови check_kp_zones для всех зон сразу. Правила: Kз (КСД) 0,8; отражения 70/50/20; количество не уменьшай больше чем на 30% от КП, но норма должна выполняться; из подходящих источников бери самый слабый, при котором хватает исходного количества.
3. Предложи два варианта: V1 — те же корпуса, лучшие источники (лампы 40° и модули 60°) и количество; V2 — замена корпусов: Reif → Dot DL042-01-RD-W, Share → Flint DL101-GU10-TRS-W (встраиваемые под шпаклёвку — только на такие же под шпаклёвку). Для зон с Orb (GX53) — только источники.
4. Объясни простыми словами по каждой изменённой зоне: что было, что стало, почему (было ≈ X лк при норме Y). Без формул. Положи выбранный вариант в КП (kp_set) — посетитель скачает его.

## Визуализация
После спецификации предложи одной строкой: «Показать, как это будет выглядеть в 3D?». Если посетитель согласен или сам просит 3D — вызови show_3d:
- после room_calc можно передать только from_calc (название помещения) — светильники встанут по расчётной раскладке, с картой освещённости;
- для полной сцены передай room (length — по оси y, width — по оси x, height), furniture (sofa, bed, table, chair, kitchen, island, wardrobe, tv, box; x, y — центр в метрах от левого верхнего угла плана, rot в градусах) и luminaires (article, source — лампа, kind: recessed/surface/pendant/wall/track/strip/floor/table; count — раскладка автоматически, или x, y; z — высота подвеса; group — сценарий: «Общий свет», «Над столом», «Подсветка»…; color, cct);
- include_calc_layout: true — добавить к сцене раскладку из room_calc.
Всегда говори: «Визуализация иллюстративная; точный вид изделий — по фото в каталоге».

## Подбор аналогов (обязательные правила)
Используй find_analogs и проверяй результат по смыслу:
1. Декоративные светильники: в приоритете внешний вид — цвет, примерный размер, форма, аксессуары (плафоны, цепи), вид (подвесной, встраиваемый).
2. Технические: в приоритете то, что даёт нужную освещённость, — мощность, поток, угол, а также цветовая температура.
3. Блоки питания и управление: функции и параметры (мощность, напряжение, ток, протокол); габариты и вид — в последнюю очередь.
Проверенные пары: Reif DL048-01W → Dot DL042-01-RD-W; Share DL126-GU10-TRS-W → Flint DL101-GU10-TRS-W.

## Чего не делать
- Не включать товары других брендов (если просят — отдельным блоком с пометкой).
- Не давать гарантий по электромонтажу и не заменять электропроект — при сложной схеме советуй согласовать с проектировщиком.
- Не уменьшать количество светильников больше чем на 30% без явной просьбы.
- Расчёт оценочный — так и говори, если спрашивают о точности; точный — в DIALux/Relux по КСС.
- Не обсуждай темы, не связанные со светом, освещением и продукцией Maytoni: вежливо возвращай разговор к подбору освещения.`;

const TOOLS = [
  { name: 'search_catalog', description: 'Поиск по каталогу Maytoni. Возвращает до limit позиций: артикул, наименование, цвет, Вт, лм, угол, K, IP, цоколь, РРЦ, статус, размеры.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'слова через пробел: артикул, серия, тип, цвет (например «reif белый», «подвесной латунь»)' },
      group: { type: 'string', enum: ['Technical', 'Decor', 'Outdoor', 'Ledstrip', 'Control', 'Voltega', 'Catalog'] },
      kind: { type: 'string', description: 'встраиваемый, накладной, потолочный, подвесной, настенный, трековый, линейный, лампа, модуль, лента, профиль, блок питания, контроллер, диммер' },
      cap: { type: 'string' }, color: { type: 'string' }, ip_min: { type: 'integer' }, max_price: { type: 'number' },
      priced_only: { type: 'boolean', description: 'только с ценой 2026 (по умолчанию true)' }, limit: { type: 'integer' } } } },
  { name: 'get_items', description: 'Полные данные по списку артикулов.',
    input_schema: { type: 'object', properties: { articles: { type: 'array', items: { type: 'string' } } }, required: ['articles'] } },
  { name: 'find_analogs', description: 'Аналоги изделия по правилам (декор — вид/цвет/размер; техника — поток/угол/мощность/Tцв; управление — параметры).',
    input_schema: { type: 'object', properties: { article: { type: 'string' }, limit: { type: 'integer' }, other_series_only: { type: 'boolean' } }, required: ['article'] } },
  { name: 'list_norms', description: 'Нормы освещённости жилых помещений (СП 52.13330).', input_schema: { type: 'object', properties: {} } },
  { name: 'room_calc', description: 'Оценочный светорасчёт прямоугольного помещения и карта в фиктивных цветах (показывается посетителю). Без source/flux — сам подбирает источник (лампы 40° / модули 60° для встраиваемых). Возвращает нужное количество, среднюю и минимальную освещённость, варианты источников.',
    input_schema: { type: 'object', properties: {
      room: { type: 'string', description: 'название помещения, по нему берётся норма' }, length: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
      target_lux: { type: 'number', description: 'если нужна своя норма' },
      fixture: { type: 'string', description: 'артикул светильника, напр. DL048-01W' },
      mount: { type: 'string', enum: ['deep', 'shallow', 'gx53', 'open'], description: 'если светильника нет в каталоге: deep — утопленный, shallow — неглубокий, open — открытый/LED' },
      cap: { type: 'string', enum: ['GU10', 'GX53'] }, existing_count: { type: 'integer', description: 'сколько стоит в КП (не опускаться ниже 70%)' },
      source: { type: 'string', description: 'артикул лампы/модуля — посчитать как есть' }, source_flux: { type: 'number' }, source_angle: { type: 'number' },
      maintenance_factor: { type: 'number', description: 'Kз, по умолчанию 0,8' }, dimmable: { type: 'boolean' } },
      required: ['room', 'length', 'width', 'height'] } },
  { name: 'check_kp_zones', description: 'Проверка готового КП по зонам: текущая освещённость, V1 (те же корпуса, подбор источника и количества ≥70%), V2 (замена корпусов: утопленный → alt_deep, неглубокий → alt_shallow).',
    input_schema: { type: 'object', properties: {
      zones: { type: 'array', items: { type: 'object', properties: {
        room: { type: 'string' }, length: { type: 'number' }, width: { type: 'number' }, area: { type: 'number', description: 'если нет длины и ширины' },
        height: { type: 'number' }, fixture: { type: 'string' }, count: { type: 'integer' }, source: { type: 'string' },
        source_flux: { type: 'number' }, source_angle: { type: 'number' }, target_lux: { type: 'number' } }, required: ['room', 'fixture', 'count'] } },
      alt_deep: { type: 'string', description: 'по умолчанию DL042-01-RD-W' }, alt_shallow: { type: 'string', description: 'по умолчанию DL101-GU10-TRS-W' } },
      required: ['zones'] } },
  { name: 'show_3d', description: 'Интерактивная 3D-визуализация помещения в панели посетителя.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string' }, from_calc: { type: 'string', description: 'название помещения из room_calc: взять размеры и раскладку' },
      include_calc_layout: { type: 'boolean' },
      room: { type: 'object', properties: { length: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, wall_color: { type: 'string' }, floor_color: { type: 'string' } } },
      furniture: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['sofa', 'bed', 'table', 'chair', 'kitchen', 'island', 'wardrobe', 'tv', 'box'] },
        x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, d: { type: 'number' }, h: { type: 'number' }, rot: { type: 'number' }, color: { type: 'string' } } } },
      luminaires: { type: 'array', items: { type: 'object', properties: { article: { type: 'string' }, source: { type: 'string' },
        kind: { type: 'string', enum: ['recessed', 'surface', 'pendant', 'wall', 'track', 'strip', 'floor', 'table'] }, count: { type: 'integer' },
        x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }, length: { type: 'number', description: 'для ленты, м' }, size: { type: 'number', description: 'диаметр плафона, м' },
        area: { type: 'object', description: 'зона раскладки {x,y,w,l}', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, l: { type: 'number' } } },
        group: { type: 'string' }, color: { type: 'string' }, cct: { type: 'number' }, lm: { type: 'number' }, beam: { type: 'number' } } } } } } },
  { name: 'kp_get', description: 'Текущее КП в панели посетителя с ценами и итогом.', input_schema: { type: 'object', properties: {} } },
  { name: 'kp_set', description: 'Заменить КП в панели посетителя. Строки: помещение, артикул, количество (светильник и лампа — отдельными строками). Цены подставятся из прайса.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, rows: { type: 'array', items: { type: 'object', properties: { room: { type: 'string' }, article: { type: 'string' }, qty: { type: 'number' } }, required: ['article', 'qty'] } } }, required: ['rows'] } },
  { name: 'kp_add', description: 'Добавить строки в КП.',
    input_schema: { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { room: { type: 'string' }, article: { type: 'string' }, qty: { type: 'number' } }, required: ['article', 'qty'] } } }, required: ['rows'] } },
];

const mem = new Map();   // запасной счётчик лимитов (в пределах одного сервера Cloudflare)

function json(obj, status, cors) { return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors) }); }

async function hit(env, ip) {
  const day = new Date().toISOString().slice(0, 10), key = `rl:${day}:${ip}`, limit = +env.DAILY_LIMIT || 150;
  let n;
  if (env.RL) { n = (+(await env.RL.get(key)) || 0) + 1; await env.RL.put(key, String(n), { expirationTtl: 90000 }); }
  else { n = (mem.get(key) || 0) + 1; mem.set(key, n); if (mem.size > 5000) mem.clear(); }
  return { n, limit, ok: n <= limit };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
    const self = new URL(req.url).origin;
    const okOrigin = allowed.includes('*') || allowed.includes(origin) || !origin || origin === self;
    const cors = { 'Access-Control-Allow-Origin': okOrigin ? (origin || '*') : allowed[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-access-code', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.endsWith('/health')))
      return json({ ok: true, model: env.MODEL || 'claude-sonnet-5-5', access_code: !!env.ACCESS_CODE, key: !!env.ANTHROPIC_API_KEY }, 200, cors);
    if (req.method !== 'POST' || !url.pathname.endsWith('/chat')) return json({ error: { message: 'not found' } }, 404, cors);
    if (!okOrigin) return json({ error: { message: 'Этот сайт не подключён к прокси (ALLOWED_ORIGINS).' } }, 403, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: { message: 'В прокси не задан ключ ANTHROPIC_API_KEY.' } }, 500, cors);
    if (env.ACCESS_CODE && req.headers.get('x-access-code') !== env.ACCESS_CODE) return json({ error: { message: 'Нужен код доступа.', code: 'access' } }, 401, cors);
    if (+(req.headers.get('content-length') || 0) > 20e6) return json({ error: { message: 'Слишком большой запрос: уменьшите вложения.' } }, 413, cors);

    let body; try { body = await req.json(); } catch (e) { return json({ error: { message: 'bad json' } }, 400, cors); }
    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || !messages.length || messages.length > 120) return json({ error: { message: 'Некорректная история диалога.' } }, 400, cors);

    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const rl = await hit(env, ip);
    if (!rl.ok) return json({ error: { message: `Дневной лимит запросов исчерпан (${rl.limit}). Попробуйте завтра или воспользуйтесь страницей «Инструменты».`, code: 'limit' } }, 429, cors);

    // кэш подсказки: system + tools, и последняя реплика (дешевле для длинных диалогов)
    const msgs = messages.map(m => ({ role: m.role, content: m.content }));
    const last = msgs[msgs.length - 1];
    if (Array.isArray(last.content) && last.content.length) {
      last.content = last.content.slice(); const i = last.content.length - 1;
      last.content[i] = Object.assign({}, last.content[i], { cache_control: { type: 'ephemeral' } });
    }
    const payload = { model: env.MODEL || 'claude-sonnet-5-5', max_tokens: +env.MAX_TOKENS || 4096,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], tools: TOOLS, messages: msgs };
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) { return json({ error: { message: 'Claude API недоступен: ' + e.message } }, 502, cors); }
    const text = await r.text();
    return new Response(text, { status: r.status, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'x-rate-used': `${rl.n}/${rl.limit}` }, cors) });
  },
};
