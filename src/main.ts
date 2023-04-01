import { chromium } from 'playwright';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { sumTotalPayment } from './util';

dotenv.config();

(async () => {
    try {
        const ID = process.env.ID;
        const PASS = process.env.PASS;
        if (!ID || !PASS) throw new Error("ID or PASS is not set.");

        // storageフォルダに保存
        const downloadDir = path.join(__dirname, '..', 'storage');
        console.log(downloadDir);
        
        const browser = await chromium.launch({
            headless: true,
            downloadsPath: downloadDir,
            args: [
                '--incognito',
                '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36'
            ]
        });
        const context = await browser.newContext({
            acceptDownloads: true,
        });
        const page = await context.newPage();

        await page.goto("https://www.rakuten-card.co.jp/e-navi/index.xhtml");
        await page.waitForTimeout(3000);

        await page.fill('input[name="u"]', ID);
        await page.fill('input[name="p"]', PASS);

        await Promise.all([
            page.click('input[id="loginButton"]'),
            page.waitForLoadState('networkidle'),
        ]);

        await page.waitForTimeout(2000);

        // 利用明細画面に遷移する
        await Promise.all([
            page.goto('https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml?l-id=enavi_all_glonavi_statement'),
            page.waitForLoadState('networkidle'),
        ]);

        const availableOptionsTexts = await page.evaluate(() => {
            const cardSelect = <HTMLInputElement>document.querySelector('.stmt-head-regist-card__select__box');
            return Array.from(cardSelect.querySelectorAll('option'))
                .filter((option) => !option.innerText.includes('利用不可'))
                .filter((option) => option.selected === false)
                .map((option) => option.innerText);
        });

        // 利用明細CSVのダウンロード
        const downloadFunc = async () => {
            const downloadPromise = page.waitForEvent('download', {timeout: 10000});
            await page.click('.stmt-c-btn-dl.stmt-csv-btn');
            const download = await downloadPromise;
            const unixtime = Math.floor(new Date().getTime() / 1000);
            await download.saveAs(path.join(downloadDir, unixtime + 'rakuten-card.csv'));
        }

        // 初期の利用可能なカードの利用明細をダウンロード
        await downloadFunc();

        // その他利用可能なカードの利用明細をダウンロード
        for (const option of availableOptionsTexts) {
            // カードを選択
            await page.locator('.stmt-head-regist-card__select__box').selectOption(option);
            await page.waitForLoadState('networkidle');
            await downloadFunc();
        }

        await browser.close();

        const total = await sumTotalPayment(path.join(__dirname, 'storage'))
       
        // bashに出力
        console.info(total);

    } catch (err) {
        console.error(err);
    }
})();