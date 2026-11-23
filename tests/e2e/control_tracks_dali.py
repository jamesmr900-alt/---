import asyncio,json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1500,'height':1100}); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('http://localhost:8790/tools.html'); await pg.wait_for_function("window.MT&&MT.catalog&&MT.catalog.length>100",timeout=60000); await pg.wait_for_timeout(1500)
        await pg.evaluate("""MTUI.kp.set([{room:'Гостиная',a:'DL115-10W-3K-W',qty:40},{room:'Кухня',a:'DL115-10W-3K-W',qty:32},{room:'Спальня',a:'DL115-10W-3K-W',qty:20},{room:'Кабинет',a:'TR030-2-12W3K-B',qty:6}], 'тест')""")
        # project with only part; KP extra (track from Kits) must appear
        await pg.evaluate("""PROJECT.set([{name:'Гостиная'},{name:'Кухня'},{name:'Спальня'}],[{room:'Гостиная',a:'DL115-10W-3K-W',qty:40},{room:'Кухня',a:'DL115-10W-3K-W',qty:32},{room:'Спальня',a:'DL115-10W-3K-W',qty:20}],'тест')""")
        await pg.evaluate("MTUI.kp.add([{room:'Кабинет',a:'TRX034-SCH-423B',qty:1},{room:'Кабинет',a:'TR030-2-12W3K-B',qty:6}])")
        await pg.evaluate("showTab('ctl')"); await pg.wait_for_timeout(500)
        await pg.click('#ctFromKp'); await pg.wait_for_timeout(300)
        print(await pg.inner_text('#ctMsg')); print((await pg.inner_text('#ctTab'))[-900:])
        await pg.click('#ctGo'); await pg.wait_for_timeout(800)
        titles=await pg.evaluate("[...document.querySelectorAll('#ctOut [data-o] .big')].map(x=>x.textContent)"); print(titles)
        for name in ['DALI','ZigBee']:
            i=next((k for k,t in enumerate(titles) if t.strip()==name),None)
            if i is None: print('no',name); continue
            await pg.click(f'#ctOut [data-o="{i}"]'); await pg.wait_for_timeout(500)
            txt=await pg.inner_text('#ctOut'); 
            for ln in txt.split('\n'):
                if any(k in ln for k in ['721013','721014','Ретранслятор','аналог','DALI:','Мастер','TR030','Кабинет']): print('  ',ln[:300])
        await pg.screenshot(path='/tmp/s_ctl.png',full_page=True)
        # apply to KP
        await pg.click('#ctToKp'); await pg.wait_for_timeout(300); print(await pg.inner_text('#ctToKp'))
        print([r for r in await pg.evaluate("MTUI.kp.get().rows") if r['room']=='Кабинет'])
        print(errs[:5]); await b.close()
asyncio.run(main())
