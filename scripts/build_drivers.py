"""Таблица драйверов (выгрузка Google Sheet в текст/CSV) → data/drivers.json.
Тип питания: CC (драйвер тока), CV12/CV24/CV48 (источник напряжения → диммер/блок питания), AC (DOB, драйвер на плате, замена невозможна)."""
import csv, json, re, sys, io
src, out = sys.argv[1], sys.argv[2]
lines = [l for l in open(src, encoding='utf-8') if not l.startswith('## ')]
rows = list(csv.reader(io.StringIO(''.join(lines))))
res = {}
def num(s):
    m = re.search(r'(\d+(?:[.,]\d+)?)', s or ''); return float(m.group(1).replace(',', '.')) if m else None
for r in rows:
    if len(r) < 14 or not re.match(r'^[A-Z0-9][A-Z0-9\-\.]+$', r[0].strip()): continue
    a = r[0].strip(); vout = r[11].strip(); w = num(r[10]); ma = num(r[12]); n = num(r[13]) or 1
    vo = vout.upper().replace(' ', '')
    if re.search(r'2[0-4]0V|AC|277', vo) and not re.search(r'DC', vo): t = 'AC'
    elif re.fullmatch(r'(DC)?12V(DC)?', vo): t = 'CV12'
    elif re.fullmatch(r'(DC)?24V(DC)?', vo): t = 'CV24'
    elif re.fullmatch(r'(DC)?48V(DC)?', vo): t = 'CV48'
    elif ma: t = 'CC'
    elif re.fullmatch(r'(DC)?(5|36)V', vo): t = 'CV' + re.sub(r'\D', '', vo)
    else: t = 'CC' if vout else ''
    if not t: continue
    rng = [float(x) for x in re.findall(r'(\d+(?:\.\d+)?)', vo.split('MAX')[0])][:2]
    d = {'t': t, 'vin': r[5].strip(), 'vout': vout}
    if w: d['w'] = w
    if ma: d['ma'] = ma
    if n and n != 1: d['n'] = int(n)
    if t == 'CC' and rng: d['v'] = rng
    res[a] = d
json.dump(res, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(res), Counter(v['t'] for v in res.values()))
