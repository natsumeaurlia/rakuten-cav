import { Page, chromium } from 'playwright'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { sumTotalPayment, sumTotalPaymentDir } from './util'
import { lineNotify } from './line-notify'
import { CardStatement, PaymentResult } from './types'
import _ from 'lodash'

dotenv.config()
;(async () => {
  try {
    const { ID, PASS, LINE_ACCESS_TOKEN } = process.env
    if (!ID || !PASS || !LINE_ACCESS_TOKEN) {
      throw new Error('ID or PASS or LINE_TOKEN is not set.')
    }

    // storageフォルダに保存
    const downloadDir = path.join(__dirname, '..', 'storage')
    const browser = await chromium.launch({
      headless: true,
      downloadsPath: downloadDir,
      args: ['--incognito', '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36'],
    })
    const context = await browser.newContext({
      acceptDownloads: true,
    })
    const page = await context.newPage()

    await login(page, ID, PASS)
    const currentMonth = await calcCardStatement(page, downloadDir, 1) // 今月の利用明細
    const nextMonth = await calcCardStatement(page, downloadDir, 0) // 翌月の利用明細

    const message = await createNotifyMessage([...currentMonth, ...nextMonth])

    await lineNotify(message, LINE_ACCESS_TOKEN)

    await browser.close()
  } catch (err) {
    console.error(err)
  }
})()

/**
 * 楽天のEナビにログインする
 * @param page
 * @param  username
 * @param  password
 */
async function login(page: Page, username: string, password: string) {
  await page.goto('https://www.rakuten-card.co.jp/e-navi/index.xhtml')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
  await page.fill('input[name="u"]', username)
  await page.fill('input[name="p"]', password)
  await Promise.all([page.click('input[id="loginButton"]'), page.waitForLoadState('networkidle')])
  await page.waitForTimeout(5000)
}

/**
 * 利用明細画面に遷移して、すべての利用可能なカードの利用明細をダウンロードし、合計金額を計算する
 * @param  page
 * @param  downloadDir
 * @param  beforeMonth
 * @returns  月ごとのカードの利用明細
 */
async function calcCardStatement(page: Page, downloadDir: string, beforeMonth: number): Promise<CardStatement[]> {
  const cardStatements: CardStatement[] = []
  await moveToStatementPage(page, beforeMonth)

  const selectedCardName = await getSelectedCardName(page)
  const selectedCardFilePath = await downloadStatement(page, downloadDir)

  if (selectedCardFilePath === null) {
    return cardStatements
  }

  const total = await sumTotalPayment(selectedCardFilePath)
  cardStatements.push({ cardName: selectedCardName, total })

  const availableCardOptions = await getAvailableCardOptions(page)

  // ダウンロードリンクを押した後、カード切り替えするとurlにクエリパラメータが付与されるのでリロードする
  await Promise.all([page.reload(), page.waitForLoadState('networkidle'), page.waitForSelector('.stmt-head-regist-card__select__box')])

  for (const option of availableCardOptions) {
    await selectCard(page, option)
    const cardFilePath = await downloadStatement(page, downloadDir)

    if (cardFilePath === null) {
      continue
    }

    const total = await sumTotalPayment(cardFilePath)
    cardStatements.push({ cardName: option, total })
  }
  return cardStatements
}

/**
 * 指定したカードを選択する
 * @param  page
 * @param  cardOption
 */
async function selectCard(page: Page, cardOption: string) {
  await page.locator('.stmt-head-regist-card__select__box').selectOption(cardOption)
  await page.waitForLoadState('networkidle')
}

/**
 * 利用明細画面に遷移する
 * @param page
 * @param beforeMonth 翌月を基準に何ヶ月前の利用明細を取得するか。指定がなかったら今月
 */
async function moveToStatementPage(page: Page, beforeMonth?: number) {
  let pageLink = 'https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml'
  // tabNo=0が翌月、tabNo=1が今月。指定がなかったら今月。tabNo=2~は過去の利用明細
  if (beforeMonth === undefined || beforeMonth === 1) {
    pageLink += '?l-id=enavi_all_glonavi_statement&tabNo=1'
  } else {
    pageLink += `?tabNo=${beforeMonth}`
  }

  await Promise.all([page.goto(pageLink), page.waitForLoadState('networkidle'), page.waitForSelector('.stmt-head-regist-card__select__box')])
}

/**
 * 利用可能なカードの名前の配列を取得
 * @param  page
 * @returns 利用可能なカードの名前の配列
 */
async function getAvailableCardOptions(page: Page): Promise<string[]> {
  const availableOptionsTexts = await page.evaluate(() => {
    const cardSelect = <HTMLSelectElement>document.querySelector('.stmt-head-regist-card__select__box')
    return (
      Array.from(cardSelect.querySelectorAll('option'))
        // .filter((option) => !option.innerText.includes('利用不可'))
        .filter((option) => option.selected === false)
        .map((option) => option.innerText)
    )
  })
  return availableOptionsTexts
}

/**
 * 現在選択中のカード名前を取得
 * @param page
 * @returns カード名
 */
async function getSelectedCardName(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const cardSelect = <HTMLSelectElement>document.querySelector('.stmt-head-regist-card__select__box')
    return cardSelect.selectedOptions[0].innerText
  })
}

/**
 * 利用明細CSVのダウンロード
 * @param page
 * @param  downloadDir ダウンロード先のディレクトリ
 * @returns ダウンロードしたファイルのパス
 */
async function downloadStatement(page: Page, downloadDir: string): Promise<string | null> {
  // 10秒でタイムアウト、エラーは握り潰して、nullを返す
  const downloadPromise = await page.waitForEvent('download', { timeout: 10000 }).catch(() => null)

  if (downloadPromise === null) {
    return null
  }

  const el = page.locator('.stmt-c-btn-dl.stmt-csv-btn')

  if (!(await el.count())) {
    return null
  }
  await el.click()

  const download = await downloadPromise
  const unixtime = Math.floor(new Date().getTime() / 1000)
  const downloadPath = path.join(downloadDir, unixtime + 'rakuten-card.csv')
  await download.saveAs(downloadPath)
  return downloadPath
}

/**
 * 利用明細から通知用のメッセージを作成する
 * @param  cardStatements
 * @returns 通知用のメッセージ
 */
async function createNotifyMessage(cardStatements: CardStatement[]): Promise<string> {
  const statements = _.groupBy<CardStatement>(cardStatements, 'cardName')

  let message = ''
  for (const [key, value] of Object.entries(statements)) {
    message += `${key}の利用明細\n`
    for (const statement of value) {
      message += Object.entries(statement.total)
        .map(([key, value]) => `${key}: ${value}\n`)
        .join('')
    }
    message += '\n'
  }
  return message
}
