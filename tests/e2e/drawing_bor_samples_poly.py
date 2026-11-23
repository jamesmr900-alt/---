import asyncio, sys, json
from playwright.async_api import async_playwright
PDF="/mnt/user-data/uploads/446e5393-_______17.11_1.pdf"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1500,'height':1100})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8790/tools.html#drw'); await pg.wait_for_function('window.DRAWING && window.KPM && window.VOLTUM && VOLTUM.catalog', timeout=30000)
        await pg.set_input_files('#dPdf', PDF)
        await pg.wait_for_function("/Листов:|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=600000)
        await pg.select_option('#dPage', '11'); await pg.select_option('#dMode', 'light'); await pg.click('#dOpen')
        await pg.wait_for_function("/Лист \\d+:|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        print(await pg.inner_text('#dMsg'))
        print(await pg.evaluate("DRAWING.st.samples.map(s=>s.label+' '+s.kind+' '+s.w+'x'+s.h).join(' | ')"))
        print(await pg.evaluate("DRAWING.st.rooms.map(r=>r.name+(r.x?' ⌖'+Math.round(r.x)+','+Math.round(r.y):' -')).join(' | ')"))
        # manual samples: red dot and green circle
        await pg.evaluate("DRAWING.st.samples.forEach(s=>s.on=false)")
        print(await pg.evaluate("JSON.stringify([DRAWING.addSampleRect('Светильник потолочный', [630,305,675,350]), DRAWING.addSampleRect('Подвесной светильник', [1470,465,1525,520])].map(s=>[s.label,s.kind,s.a,s.why,s.w,s.h]))"))
        await pg.click('#dFind'); await pg.wait_for_function("/Найдено значков|не удался/.test(document.querySelector('#dMsg').textContent)", timeout=600000)
        print(await pg.inner_text('#dMsg'))
        print(await pg.evaluate("DRAWING.st.samples.map((s,i)=>s.label.slice(0,22)+': '+DRAWING.st.dets.filter(d=>d.ti===i&&!d.off).length).join(' | ')"))
        print(json.dumps(await pg.evaluate("DRAWING.counts()"), ensure_ascii=False))
        open('/tmp/b11.json','w').write(await pg.evaluate("JSON.stringify({d:DRAWING.st.dets.map(d=>[d.x,d.y,d.w,d.h,d.ti,d.room]),r:DRAWING.st.rooms.map(r=>[r.name,r.x,r.y])})"))
        i=await pg.evaluate("DRAWING.st.rooms.findIndex(r=>r.name==='Коридор')")
        await pg.evaluate(f"DRAWING.setRoomPoly({i}, [[1250,820],[2100,820],[2100,1300],[1250,1300]])")
        print('POLY', await pg.inner_text('#dMsg'))
        print(json.dumps(await pg.evaluate("DRAWING.counts()"), ensure_ascii=False))
        print('roomAt', await pg.evaluate("[DRAWING.roomAt(2014,871), DRAWING.roomAt(1134,514), DRAWING.roomAt(1425,1186)]"))
        await pg.screenshot(path='/tmp/s_poly.png')
        print(errs[:5]); await b.close()
asyncio.run(main())
