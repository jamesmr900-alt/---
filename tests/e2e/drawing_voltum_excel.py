import asyncio, json, base64, os, time
from playwright.async_api import async_playwright
PDF="/mnt/user-data/uploads/af01ffa1-_________1_1.pdf"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':1500,'height':1100}, accept_downloads=True); pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8790/tools.html#drw'); await pg.wait_for_function('window.DRAWING && window.VOLTUM && VOLTUM.catalog', timeout=30000)
        await pg.evaluate("localStorage.setItem('maytoni_help_v1', JSON.stringify({off:true}))")
        await pg.set_input_files('#dPdf', PDF)
        await pg.wait_for_function("/Листов:/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        await pg.click('#dOpen'); await pg.wait_for_function("/Лист \\d+:/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        await pg.click('#dFind'); await pg.wait_for_function("/Найдено значков/.test(document.querySelector('#dMsg').textContent)", timeout=300000)
        await pg.locator('#dGroups').screenshot(path='/tmp/p2/groups2.png')
        auto = await pg.evaluate("JSON.stringify({samples: DRAWING.st.samples.map(s=>s.label), counts: DRAWING.counts(), frames: DRAWING.frameInfo(), groups: [...document.querySelectorAll('[data-gsel]')].map(s=>[s.dataset.gsel, s.value, s.closest('div[style]').innerText.split('\\n')[0]])})")
        open('/tmp/p2/auto2.json','w').write(auto)
        print('READY'); 
        while not os.path.exists('/tmp/p2/fix.json'): await asyncio.sleep(1)
        fix = json.load(open('/tmp/p2/fix.json'))
        for j, v in fix.get('groups', {}).items():
            await pg.select_option(f'[data-gsel="{j}"]', str(v))
        await pg.screenshot(path='/tmp/p2/after_fix.png', full_page=True)
        corr = await pg.evaluate("JSON.stringify({counts: DRAWING.counts(), frames: DRAWING.frameInfo(), diag: DRAWING.st.frameDiag, dets: DRAWING.st.dets.filter(d=>!d.off).map(d=>[d.x,d.y,d.w,d.h,d.ti,d.room]), rooms: DRAWING.st.rooms.map(r=>[r.name,r.x,r.y]), lbl: DRAWING.st.frameLbl})")
        open('/tmp/p2/corr.json','w').write(corr)
        await pg.click('#dToV'); await pg.wait_for_timeout(800)
        await pg.select_option('#vSer', fix.get('ser','S70')); await pg.select_option('#vCol', fix.get('col','02'))
        await pg.select_option('#vFr', 'plastic'); await pg.select_option('#vFrCol', fix.get('col','02'))
        await pg.click('#vGo'); await pg.wait_for_timeout(600)
        print(await pg.inner_text('#vOut'))
        await pg.locator('section[data-p="eui"]').screenshot(path='/tmp/p2/eui.png')
        async with pg.expect_download() as dl:
            await pg.click('#vXlsx')
        d = await dl.value; await d.save_as('/tmp/p2/voltum_kp.xlsx'); print('saved xlsx')
        await pg.click('#vToKp'); await pg.wait_for_timeout(800)
        await pg.evaluate("showTab('kp')"); await pg.wait_for_timeout(500)
        async with pg.expect_download() as dl2:
            await pg.click('#kpX')
        d2 = await dl2.value; await d2.save_as('/tmp/p2/kp_full.xlsx'); print('saved kp')
        await pg.locator('section[data-p="kp"]').screenshot(path='/tmp/p2/kp.png')
        print(errs[:5]); await b.close()
asyncio.run(main())
