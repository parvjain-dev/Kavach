import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 420, 'height': 900})
        await pg.goto('http://localhost:8099/#/check?lang=kn'); await pg.wait_for_timeout(800)
        await pg.fill('#msg-in', 'ನಿಮ್ಮ SBI KYC ಅವಧಿ ಮುಗಿದಿದೆ. ತಕ್ಷಣ http://sbi-kyc-update.xyz ನಲ್ಲಿ ಅಪ್‌ಡೇಟ್ ಮಾಡಿ, ಇಲ್ಲದಿದ್ದರೆ ಖಾತೆ ಬ್ಲಾಕ್ ಆಗುತ್ತದೆ.')
        await pg.click('#go'); await pg.wait_for_selector('.stamp'); await pg.wait_for_timeout(900)
        await pg.screenshot(path='docs/shots/08-parent-kannada.png', full_page=True)
        await b.close()
asyncio.run(main())
