"""Сборка data/catalog.json из прайс-листов Maytoni (РРЦ *_2026_NEW.xlsx) и maytoni_catalog.xlsx.
Запуск:  python scripts/build_catalog.py <папка_с_прайсами> data/catalog.json
Имена файлов ищутся по шаблонам ниже — при новых прайсах поправьте шаблоны."""
import pandas as pd, json, glob, re, math
import sys
U=(sys.argv[1] if len(sys.argv)>1 else '.').rstrip('/')+'/'
def f(p): return glob.glob(U+p)[0]
src={'Technical':f('*Technical_2026_NEW.xlsx'),'Decor':f('*____Maytoni_2026_NEW.xlsx'),'Outdoor':f('*Outdoor_2026_NEW.xlsx'),
     'Ledstrip':f('*Ledstrip_2026_NEW.xlsx'),'Control':f('*Lighting_control_2026_NEW.xlsx'),'Voltega':f('*Voltega_2026_NEW.xlsx')}
def num(v):
    if v is None or (isinstance(v,float) and math.isnan(v)): return None
    if isinstance(v,(int,float)): return round(float(v),2)
    m=re.search(r'\d+(?:[.,]\d+)?',str(v)); return round(float(m.group().replace(',','.')),2) if m else None
def s(v):
    if v is None or (isinstance(v,float) and math.isnan(v)): return None
    v=str(v).strip(); return v or None
out={}
for cat,p in src.items():
    d=pd.read_excel(p,header=3,dtype={'Артикул':str})
    for _,r in d.iterrows():
        a=s(r.get('Артикул'))
        if not a: continue
        if 'Бренд' in r and s(r['Бренд']) is None: continue
        g=lambda *ks: next((r[k] for k in ks if k in r and s(r[k]) is not None),None)
        it=dict(a=a,g=cat,n=s(g('Полное наименование','Наименование (тип)')),c=s(g('Коллекция')),se=s(g('Серия')),
            t=s(g('Тип светильника','Тип продукта','Наименование (тип)')),col=s(g('Цвет','Цвет араматуры','Цвет свечения')),
            st=s(g('Статус')),p=num(g('РРЦ, руб.','РРЦ, шт')),pm=num(g('РРЦ, м')),
            w=num(g('Мощность','Мощность, W','Выходная мощность')),lm=num(g('Световой Поток','Световой поток, Лм')),
            k=s(g('Цветовая температура','Цветовая температура, K','Цветовая температура, К')),ang=num(g('Угол рассеивания')),
            ip=s(g('IP','Класс IP')),cap=s(g('Цоколь')),dim=s(g('Диммирование','Диммируемая')),ctl=s(g('Управление')),
            h=num(g('Высота','Высота, мм','Высота мм')),l=num(g('Длина','Длина мм','Глубина')),wd=num(g('Ширина','Ширина мм')),dm=num(g('Диаметр','Диаметр, мм','Диаметр мм')),
            cri=num(g(' CRI')),nl=num(g('Кол-во','Кол-во источников света')),comp=s(g('Совместимость')),acc=s(g('Комплектующие')),v=s(g('Выходное напряжение','Питание, В')),i=s(g('Выходной ток')))
        if not it.get('n'):
            it['n']=' '.join(str(v) for v in [it.get('t'),it.get('se'),(f"{int(it['nl'])}*{it['cap']}" if it.get('nl') and it.get('cap') else it.get('cap')),it.get('col')] if v)
        out[a]={k:v for k,v in it.items() if v is not None}
c=pd.read_excel(f('*maytoni_catalog.xlsx'),sheet_name=0,dtype={'Артикул':str})
add=0
for _,r in c.iterrows():
    a=s(r['Артикул']); 
    if not a: continue
    it=out.get(a)
    m={'w':'Мощность, Вт','lm':'Световой поток, лм (лм/м для лент)','k':'Цвет. темп., K','ang':'Угол, °','ip':'IP','cri':'CRI'}
    if it is None:
        it=dict(a=a,g='Catalog',t=s(r['Тип']),se=s(r['Серия']),col=s(r['Цвет/отделка']),st='нет в прайсе 2026'); out[a]=it; add+=1
    for k,col in m.items():
        if k not in it:
            v=r[col]; v=(num(v) if k in('w','lm','ang','cri') else s(v))
            if v is not None: it[k]=v
    if 'ds' not in it and s(r['Описание серии']): it['ds']=s(r['Описание серии'])[:200]
print(len(out),'added',add)
d=list(out.values())
for x in d:
    x.pop('ds',None)
    for k in list(x):
        v=x[k]
        if isinstance(v,str):
            v=v.replace('\xa0',' ').strip(); x[k]=v
            if v in('-','—','0','nan',''): del x[k]
    if 'ang' not in x and x.get('n'):
        m=re.search(r'(\d{2,3})\s*°',x['n'])
        if m: x['ang']=float(m.group(1))
    if 'lm' not in x and x.get('n'):
        m=re.search(r'(\d{3,5})\s*[Лл]м',x['n'])
        if m: x['lm']=float(m.group(1))
    if 'ip' in x:
        m=re.search(r'\d{2}',str(x['ip'])); x['ip']='IP'+m.group() if m else x['ip']
    if 'k' in x and re.fullmatch(r'\d+\.0',str(x['k'])): x['k']=str(x['k'])[:-2]
dst=sys.argv[2] if len(sys.argv)>2 else 'data/catalog.json'
json.dump(d,open(dst,'w'),ensure_ascii=False,separators=(',',':'))
print('saved',dst,len(d))
