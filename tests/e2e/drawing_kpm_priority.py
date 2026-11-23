import asyncio, sys, json
from playwright.async_api import async_playwright
PDF=sys.argv[1]; PAGE=sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':1500,'height':1100}, accept_downloads=True); pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8790/tools.html#drw'); await pg.wait_for_function('window.DRAWING && window.KPM && window.VOLTUM && VOLTUM.catalog', timeout=30000)
        await pg.evaluate("localStorage.setItem('maytoni_help_v1', JSON.stringify({off:true}))")
        await pg.set_input_files('#dPdf', PDF)
        await pg.wait_for_function("/Листов:|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=600000)
        await pg.select_option('#dPage', PAGE); await pg.click('#dOpen')
        await pg.wait_for_function("/Лист \\d+:|Не удалось/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        print(await pg.inner_text('#dMsg'))
        print(json.dumps(await pg.evaluate("DRAWING.st.samples.map(s=>[s.label.slice(0,45), s.kind, s.vid||'', s.a||'', s.why||''])"), ensure_ascii=False, indent=0))
        print(await pg.evaluate("DRAWING.st.rooms.map(r=>r.name+(r.x?' ⌖':' -')).join(' | ')"))
        await pg.click('#dFind'); await pg.wait_for_function("/Найдено значков|не удался/.test(document.querySelector('#dMsg').textContent)", timeout=600000)
        print(await pg.evaluate("DRAWING.st.samples.map((s,i)=>s.label.slice(0,22)+': '+DRAWING.st.dets.filter(d=>d.ti===i&&!d.off).length+(s.qty!=null?'/'+s.qty:'')).join(' | ')"))
        await pg.screenshot(path='/tmp/s_drw2.png', full_page=True)
        if await pg.locator('#dToK').count():
            await pg.click('#dToK'); await pg.wait_for_timeout(500)
            print(json.dumps(await pg.evaluate("KPM.types.map(t=>[t.label.slice(0,45), t.a, (MT.get(t.a)||{}).n?.slice(0,50), t.why])"), ensure_ascii=False, indent=0))
            print(json.dumps(await pg.evaluate("KPM.counts"), ensure_ascii=False))
            await pg.evaluate("document.querySelector('#kmTrAdd').click()")
            await pg.click('#kmGo'); await pg.wait_for_timeout(600)
            print((await pg.inner_text('#kmOut'))[:2500])
            await pg.locator('section[data-p="kpm"]').screenshot(path='/tmp/s_kpm.png')
            async with pg.expect_download() as dl: await pg.click('#kmXlsx')
            await (await dl.value).save_as('/tmp/KP_Maytoni_Priority_list34.xlsx'); print('xlsx saved')
        print(errs[:5]); await b.close()
asyncio.run(main())
