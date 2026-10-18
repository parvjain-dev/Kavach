import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8099'
OUT = '/home/claude/kavach/docs/shots'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900})
        pg = await ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + '/#/'); await pg.wait_for_timeout(900)
        await pg.screenshot(path=f'{OUT}/01-landing.png')
        # guardian
        await pg.goto(BASE + '/#/guardian'); await pg.wait_for_timeout(500)
        await pg.click('#g-guest'); await pg.wait_for_selector('#setup')
        await pg.fill('input[name=guardianName]', 'Arjun'); await pg.fill('input[name=parentName]', 'Papa')
        await pg.fill('input[name=parentPhone]', '+919812345678')
        await pg.click('#setup button[type=submit]'); await pg.wait_for_selector('.code-bar')
        code = (await pg.inner_text('.code')).strip()
        print('code', code)
        await pg.click('#seed'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/02-guardian-seeded.png', full_page=True)
        # parent in 2nd tab
        pp = await ctx.new_page()
        pp.on('pageerror', lambda e: errs.append('parent:' + str(e)))
        await pp.set_viewport_size({'width': 420, 'height': 900})
        await pp.goto(BASE + f'/#/check?code={code}&lang=hi'); await pp.wait_for_timeout(1200)
        await pp.screenshot(path=f'{OUT}/03-parent-empty.png')
        await pp.fill('#msg-in', 'Dear customer your SBI account KYC is expired. Update immediately within 24 hours: http://sbi-kyc-update.xyz/login or your account will be blocked.')
        await pp.click('#go'); await pp.wait_for_selector('.stamp', timeout=15000); await pp.wait_for_timeout(900)
        await pp.screenshot(path=f'{OUT}/04-parent-result.png', full_page=True)
        await pg.bring_to_front(); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f'{OUT}/05-guardian-live.png', full_page=True)
        print('toast:', await pg.inner_text('#toast') if await pg.is_visible('#toast') else 'none')
        print('cards', await pg.locator('.card').count(), 'camps', await pg.locator('.camp').count())
        await pg.click('#split'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/06-split.png')
        # mobile landing
        mp = await ctx.new_page(); await mp.set_viewport_size({'width': 390, 'height': 844})
        await mp.goto(BASE + '/#/'); await mp.wait_for_timeout(900); await mp.screenshot(path=f'{OUT}/07-mobile-landing.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
