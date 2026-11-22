"""Фото изделий из прайс-листов Maytoni (картинки внутри xlsx) → data/img/<артикул>.jpg (160 px) и data/img/index.json.
Запуск: python scripts/build_photos.py <папка_с_прайсами>"""
import sys, os, io, glob, json, re, zipfile
from xml.etree import ElementTree as ET
from PIL import Image
import openpyxl
SRC = (sys.argv[1] if len(sys.argv) > 1 else '.').rstrip('/') + '/'
OUT = 'data/img'; os.makedirs(OUT, exist_ok=True)
safe = lambda a: re.sub(r'[^A-Za-z0-9._-]', '_', a)
NS = {'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
done = {}
for f in sorted(glob.glob(SRC + '*_2026_NEW.xlsx')):
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True); ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True)); hdr = None
    for i, r in enumerate(rows[:10]):
        if r and 'Артикул' in [str(v).strip() if v else '' for v in r]: hdr = i; acol = [str(v).strip() if v else '' for v in r].index('Артикул'); break
    if hdr is None: continue
    z = zipfile.ZipFile(f)
    drawings = [n for n in z.namelist() if re.match(r'xl/drawings/drawing\d+\.xml$', n)]
    n0 = len(done)
    for d in drawings:
        rel = d.replace('drawings/', 'drawings/_rels/') + '.rels'
        rels = {}
        if rel in z.namelist():
            for e in ET.fromstring(z.read(rel)):
                rels[e.get('Id')] = os.path.normpath(os.path.join('xl/drawings', e.get('Target'))).replace('\\', '/')
        root = ET.fromstring(z.read(d))
        for anc in list(root):
            fr = anc.find('xdr:from', NS); blip = anc.find('.//a:blip', NS)
            if fr is None or blip is None: continue
            row = int(fr.find('xdr:row', NS).text)
            rid = blip.get('{%s}embed' % NS['r']); path = rels.get(rid)
            if row >= len(rows) or not path or path not in z.namelist(): continue
            art = rows[row][acol] if rows[row] else None
            if not art: continue
            art = str(art).strip()
            if art in done: continue
            try:
                im = Image.open(io.BytesIO(z.read(path))).convert('RGB'); im.thumbnail((160, 160))
                bg = Image.new('RGB', (160, 160), 'white'); bg.paste(im, ((160 - im.width) // 2, (160 - im.height) // 2))
                bg.save(f'{OUT}/{safe(art)}.jpg', quality=72, optimize=True); done[art] = safe(art)
            except Exception as e:
                pass
    print(os.path.basename(f), len(done) - n0)
json.dump(done, open(f'{OUT}/index.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('всего', len(done))
