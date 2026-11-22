"""Каталог ЭУИ Voltum (серии S70 и S70 Metal) → data/voltum.json.
Изделия и состав (механизм + накладка/клавиша + модуль подсветки) — по таблицам каталога Voltum 2026 (стр. 141–165);
наличие цветов — по артикулам, встреченным в тексте каталога (аргумент: файл со списком артикулов).
Артикул: VL + серия (S / SM) + категория + изделие + цвет (2 цифры)."""
import json, sys
codes = set(l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith('#'))
COLORS = {'01': 'белый глянцевый', '02': 'белый матовый', '03': 'кашемир', '04': 'шелк', '05': 'сталь', '06': 'титан', '07': 'графит', '08': 'черный матовый',
          '13': 'хлопок', '14': 'капучино', '15': 'деним', '16': 'серый', '09': 'латунь', '10': 'платина', '11': 'никель', '12': 'антрацит'}
S70 = ['01', '02', '03', '04', '05', '06', '07', '08', '13', '14', '15', '16']; MET = ['09', '10', '11', '12']
# id, название, тип для сопоставления, собранное изделие S70, механизм, накладка S70, накладка Metal, модуль подсветки, постов
P = [
 ('sock', 'Розетка с заземлением', 'socket', 'VLS0401', 'VLS0401M', 'VLS0006', 'VLSM0006', None),
 ('sock_sh', 'Розетка с заземлением и защитными шторками', 'socket', 'VLS0402', 'VLS0401M', 'VLS0007', 'VLSM0007', None),
 ('sock_lid', 'Розетка с заземлением, шторками и крышкой (IP40)', 'socket_wet', 'VLS0403', 'VLS0401M', 'VLS0008', 'VLSM0008', None),
 ('sock_usb_aa', 'Розетка с заземлением, шторками и USB A+A', 'socket_usb', 'VLS0404', 'VLS0404M', 'VLS0009', None, None),
 ('sock_usb_ac', 'Розетка с заземлением, шторками и USB A+C', 'socket_usb', 'VLS0405', 'VLS0405M', 'VLS0010', 'VLSM0010', None),
 ('rj45', 'Розетка компьютерная RJ45', 'data', 'VLS0601', 'VLS0601M', 'VLS0013', None, None),
 ('rj45x2', 'Розетка компьютерная двойная RJ45+RJ45', 'data2', 'VLS0602', 'VLS0602M', 'VLS0014', None, None),
 ('tv', 'Розетка телевизионная TV+SAT', 'tv', 'VLS0604', 'VLS0604M', 'VLS0016', None, None),
 ('tv_rj', 'Розетка телевизионная RJ45+TV', 'tvdata', 'VLS0607', 'VLS0607M', 'VLS0027', None, None),
 ('audio', 'Розетка акустическая 4-местная', 'audio', 'VLS0603', 'VLS0404M', 'VLS0015', None, None),
 ('sw1', 'Выключатель одноклавишный', 'sw1', 'VLS0101', 'VLS0101M', 'VLS0001', 'VLSM0001', None),
 ('sw2', 'Выключатель двухклавишный', 'sw2', 'VLS0201', 'VLS0201M', 'VLS0003', 'VLSM0003', None),
 ('sw3', 'Выключатель трехклавишный', 'sw3', 'VLS0301', 'VLS0301M', 'VLS0005', None, None),
 ('sw1_led', 'Выключатель одноклавишный с подсветкой', 'sw1_led', 'VLS0102', 'VLS0101M', 'VLS0002', 'VLSM0002', 'VLS080301'),
 ('sw2_led', 'Выключатель двухклавишный с подсветкой', 'sw2_led', 'VLS0202', 'VLS0201M', 'VLS0004', 'VLSM0004', 'VLS080401'),
 ('blind', 'Выключатель для жалюзи', 'blind', 'VLS0207', 'VLS0207M', 'VLS0025', None, None),
 ('card', 'Выключатель карточный', 'card', 'VLS0107', 'VLS0107M', 'VLS0026', None, 'VLS080301'),
 ('push1', 'Выключатель с самовозвратом (кнопка) одноклавишный', 'push1', 'VLS0106', 'VLS0106M', 'VLS0001', 'VLSM0001', None),
 ('push2', 'Выключатель с самовозвратом (кнопка) двухклавишный', 'push2', 'VLS0206', 'VLS0206M', 'VLS0003', 'VLSM0003', None),
 ('pass1', 'Переключатель проходной одноклавишный', 'pass1', 'VLS0103', 'VLS0103M', 'VLS0001', 'VLSM0001', None),
 ('pass1_led', 'Переключатель проходной одноклавишный с подсветкой', 'pass1_led', 'VLS0104', 'VLS0103M', 'VLS0002', 'VLSM0002', 'VLS080301'),
 ('pass2', 'Переключатель проходной двухклавишный', 'pass2', 'VLS0203', 'VLS0203M', 'VLS0003', 'VLSM0003', None),
 ('pass2_led', 'Переключатель проходной двухклавишный с подсветкой', 'pass2_led', 'VLS0204', 'VLS0203M', 'VLS0004', 'VLSM0004', 'VLS080401'),
 ('cross1', 'Переключатель перекрестный одноклавишный', 'cross1', 'VLS0105', 'VLS0105M', 'VLS0001', 'VLSM0001', None),
 ('cross2', 'Переключатель перекрестный двухклавишный', 'cross2', 'VLS0205', 'VLS0205M', 'VLS0003', 'VLSM0003', None),
 ('dim', 'Светорегулятор поворотно-нажимной 600 Вт', 'dimmer', 'VLS0703', 'VLS0703M', 'VLS0020', None, None),
 ('thermo', 'Терморегулятор электронный для теплого пола', 'thermo', 'VLS0701', None, None, None, None),
 ('nightled', 'Подсветка светодиодная встраиваемая 3000К', 'nightlight', 'VLS0706', 'VLS0706M', 'VLS0023', None, None),
 ('nightpir', 'Подсветка светодиодная с датчиком движения', 'nightlight_pir', 'VLS0707', 'VLS0707M', 'VLS0024', None, None),
 ('pir', 'Датчик движения встраиваемый', 'motion', 'VLS0705', 'VLS0705M', 'VLS0022', None, None),
 ('hdmi', 'Розетка HDMI (по сайту voltum.ru; механизм уточните)', 'hdmi', 'VLS0610', 'VLS0610M', 'VLS0029', None, None),
 ('blank', 'Заглушка с суппортом', 'blank', 'VLS0801', None, None, None, None),
 ('cable', 'Вывод для кабеля до 7 мм', 'cable', 'VLS0802', None, None, None, None),
]
def avail(base, cols): return [c for c in cols if base + c in codes]
items = []
for pid, name, typ, asm, mech, cov, covm, led in P:
    it = {'id': pid, 'n': name, 'type': typ, 'asm': asm, 'mech': mech, 'cov': cov, 'covM': covm, 'led': led}
    it['cS'] = [c for c in S70 if asm + c in codes or (cov and cov + c in codes)]
    it['cA'] = avail(asm, S70)   # цвета, в которых есть собранное изделие
    it['cM'] = avail(covm, MET) if covm else []
    items.append(it)
# Серия M25 (артикулы VLM — по сайту voltum.ru): только собранные изделия, цвета 02 / 03 / 08
M25 = {'sw1': 'VLM0101', 'sw1_led': 'VLM0102', 'sw2': 'VLM0201', 'sw2_led': 'VLM0202', 'pass1': 'VLM0103', 'push1': 'VLM0106', 'sock': 'VLM0401', 'sock_sh': 'VLM0402', 'sock_lid': 'VLM0403', 'rj45': 'VLM0601', 'blank': 'VLM0801', 'cable': 'VLM0802'}
for it in items:
    b = M25.get(it['id'])
    if b: it['m25'] = b; it['cM25'] = [c for c in ['02', '03', '08'] if b + c in codes]
frames = {'plastic': {'n': 'Рамка пластиковая', 'base': 'VLS100', 'cols': S70}, 'glass': {'n': 'Рамка стеклянная', 'base': 'VLS110', 'cols': S70}, 'metal': {'n': 'Рамка металлическая', 'base': 'VLSM120', 'cols': MET}, 'm25': {'n': 'Рамка M25', 'base': 'VLM100', 'cols': ['02', '03', '08']}}
for f in frames.values():
    f['avail'] = {str(g): [c for c in f['cols'] if f'{f["base"]}{g}{c}' in codes] for g in range(1, 6)}
json.dump({'colors': COLORS, 'S70': S70, 'MET': MET, 'items': items, 'frames': frames, 'extra': {'kozhuh': 'VLS0806', 'tsensor': 'VLS0805'}},
          open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
for it in items: print(it['id'], len(it['cS']), len(it['cM']))
print({k: {g: len(v) for g, v in f['avail'].items()} for k, f in frames.items()})
