import asyncio,sys,json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page()
        await pg.goto('http://localhost:8790/tools.html'); await pg.wait_for_function("window.MT&&MT.catalog&&MT.catalog.length>100",timeout=60000); await pg.wait_for_timeout(1500)
        print(await pg.evaluate(sys.argv[1]))
        await b.close()
asyncio.run(main())
