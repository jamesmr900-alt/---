"""DWG во вкладке «По чертежу»: чтение, значки по объектам, количество, закраска помещения, PDF.
   python tests/e2e/drawing_dwg.py <file.dwg|dxf> <out.png>"""
import asyncio, sys, json, base64
from playwright.async_api import async_playwright
F=sys.argv[1]; OUT=sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1500,'height':1000}, accept_downloads=True)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
        await pg.goto('http://localhost:8790/tools.html#drw'); await pg.wait_for_function('window.DRAWING && window.DWG && window.VOLTUM && VOLTUM.catalog && MT.catalog && MT.catalog.length', timeout=60000)
        await pg.evaluate("localStorage.setItem('maytoni_help_v1', JSON.stringify({off:true}))")
        await pg.set_input_files('#dPdf', F)
        await pg.wait_for_function("/DWG прочитан|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        print(await pg.inner_text('#dMsg'))
        await pg.click('#dOpen')
        await pg.wait_for_function("/^DWG|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        print(await pg.inner_text('#dMsg'))
        print(json.dumps(await pg.evaluate("DRAWING.st.samples.map((s,i)=>({l:s.label.slice(0,70),a:s.a,why:s.why,kind:s.kind,on:s.on,vec:!!s.vec,q:s.qty,n:DRAWING.st.dets.filter(d=>d.ti===i).length,seg:s.seg,reel:s.reel}))"), ensure_ascii=False, indent=0))
        print('rooms', await pg.evaluate("DRAWING.st.rooms.map(r=>r.name)"))
        print('counts', json.dumps(await pg.evaluate("DRAWING.counts()"), ensure_ascii=False))
        print('cv', await pg.evaluate("[DRAWING.st.cv.width, DRAWING.st.cv.height]"))
        open(OUT,'wb').write(base64.b64decode((await pg.evaluate("(()=>{const c=document.createElement('canvas'),s=DRAWING.st,k=2000/s.cv.width;c.width=2000;c.height=s.cv.height*k;const x=c.getContext('2d');x.drawImage(s.cv,0,0,c.width,c.height);x.scale(k,k);s.dets.forEach(d=>{const q=s.samples[d.ti];if(!q||!q.on)return;x.strokeStyle=q.color;x.lineWidth=2/k;x.strokeRect(d.x,d.y,d.w,d.h)});return c.toDataURL('image/png')})()")).split(',')[1]))
        await pg.screenshot(path=OUT.replace('.png','_ui.png'))
        # закраска помещения
        if await pg.evaluate("DRAWING.st.rooms.length"):
            await pg.click('[data-sr="0"]'); await pg.wait_for_timeout(300); print('hl', await pg.evaluate("DRAWING.st.hlRoom"), await pg.inner_text('#dMsg'))
            await pg.screenshot(path=OUT.replace('.png','_hl.png'))
            await pg.click('[data-sr="0"]'); print('hl2', await pg.evaluate("DRAWING.st.hlRoom"))
        async with pg.expect_download(timeout=120000) as dl:
            await pg.click('#dPdfOut')
        d = await dl.value; await d.save_as(OUT.replace('.png','.pdf')); print('pdf', d.suggested_filename)
        if await pg.query_selector('#dToK'):
            await pg.click('#dToK'); await pg.wait_for_timeout(500); await pg.click('#kmGo'); await pg.wait_for_timeout(800)
            print((await pg.inner_text('#kmOut'))[:3000])
        print('ERR', errs[:6]); await b.close()
asyncio.run(main())
