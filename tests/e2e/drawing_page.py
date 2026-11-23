import asyncio, sys
from playwright.async_api import async_playwright
PDF=sys.argv[1]; PAGE=sys.argv[2]; OUT=sys.argv[3]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1500,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8790/tools.html#drw'); await pg.wait_for_function('window.DRAWING && window.VOLTUM && VOLTUM.catalog', timeout=30000)
        await pg.evaluate("localStorage.setItem('maytoni_help_v1', JSON.stringify({off:true}))")
        await pg.set_input_files('#dPdf', PDF)
        await pg.wait_for_function("/Листов:|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        print(await pg.evaluate("DRAWING.st.titles.map(t=>t.n+' '+t.kind+' f'+t.floor+' '+t.t.slice(0,60))"))
        await pg.select_option('#dPage', PAGE); await pg.click('#dOpen')
        await pg.wait_for_function("/Лист \\d+:|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        print(await pg.inner_text('#dMsg'))
        print(await pg.evaluate("DRAWING.st.samples.map(s=>s.label+' q='+s.qty+' '+s.w+'x'+s.h+' vid='+s.vid+' frame='+(s.frame||''))"))
        print(await pg.evaluate("DRAWING.st.rooms.map(r=>r.name+' '+(r.x?'⌖':'-'))"))
        import os
        await pg.evaluate(os.environ.get('CFG','0'))
        await pg.evaluate('SYM._dbgS=[]')
        await pg.click('#dFind')
        await pg.wait_for_function("/Найдено значков|не удался/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        print(await pg.evaluate("DRAWING.st.samples.map((s,i)=>s.label.slice(0,26)+': '+DRAWING.st.dets.filter(d=>d.ti===i).length+(s.qty!=null?'/'+s.qty:'')).join(' | ')"))
        print('dbgE', await pg.evaluate('JSON.stringify(SYM._dbgE)'))
        print('dbgS', await pg.evaluate('JSON.stringify(SYM._dbgS)'))
        print('dbg', await pg.evaluate('JSON.stringify(SYM._dbg)'))
        print('glyph', await pg.evaluate("JSON.stringify(DRAWING.st.samples.map(s=>{const g=SYM.glyphColor(DRAWING.st.rgb||SYM.rgbOf(DRAWING.st.cv),DRAWING.st.cv.width,s.bb);return g&&[g.c,g.inner,g.bb.w,g.bb.h]}))"))
        print('byc', await pg.evaluate("JSON.stringify(DRAWING.st.dets.slice(0,5).map(d=>[d.byColor,d.grp]))"))
        print('size', await pg.evaluate("DRAWING.st.symSize"), await pg.evaluate("DRAWING.st.samples.map(s=>{const f=SYM.fillOf(DRAWING.st.rgb,DRAWING.st.cv.width,s.bb);return f?f.col.map(v=>Math.round((1-v)*255)).join(',')+' '+f.fb.w+'x'+f.fb.h:'-'})"))
        print(await pg.evaluate("JSON.stringify(DRAWING.frameInfo ? DRAWING.frameInfo() : null)"))
        import json, base64; open(OUT+'.json','w').write(await pg.evaluate("JSON.stringify(DRAWING.st.dets.map(d=>[d.x,d.y,d.w,d.h,d.ti]))"))
        # mosaic
        data = await pg.evaluate("""()=>{const st=DRAWING.st, n=Math.min(st.dets.length,160), c=document.createElement('canvas'); c.width=16*64; c.height=Math.ceil(n/16)*64; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height);
          st.dets.slice(0,n).forEach((d,i)=>{ x.drawImage(st.cv,d.x-3,d.y-3,d.w+6,d.h+6,(i%16)*64,Math.floor(i/16)*64,60,50); x.fillStyle='red'; x.font='9px sans-serif'; x.fillText((st.samples[d.ti].label).slice(0,12),(i%16)*64,Math.floor(i/16)*64+60); }); return c.toDataURL('image/png'); }""")
        import base64; open(OUT,'wb').write(base64.b64decode(data.split(',')[1]))
        t = await pg.evaluate("""()=>{const T=DRAWING.st._tpl; if(!T) return null; const c=document.createElement('canvas'); c.width=T.bbs.length*50; c.height=50; const x=c.getContext('2d'); x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height); T.bbs.forEach((b,i)=>x.drawImage(T.cv2,b.x-2,b.y-2,b.w+4,b.h+4,i*50,0,46,46)); return [T.k, c.toDataURL()]; }""")
        if t: print('k',t[0]); open(OUT+'.tpl.png','wb').write(base64.b64decode(t[1].split(',')[1]))
        print(errs[:5]); await b.close()
asyncio.run(main())
