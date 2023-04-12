import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'csv-parse/sync'
import type { PaymentResult, PaymentTotalKey, Record } from './types'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Tokyo')

export async function sumTotalPaymentDir(downloadDir: string) {
  // ファイル一覧を取得
  const files = fs.readdirSync(downloadDir)
  const result: PaymentResult[] = []
  for (const file of files) {
    // 拡張子がcsvのファイルのみ処理する
    if (path.extname(file) === '.csv') {
      const fileResult = await sumTotalPayment(path.join(downloadDir, file))
      result.push(fileResult)
    }
  }
  return result
}

export async function sumTotalPayment(csvFilePath: string) {
  // CSVファイルを読み込む
  const csvData = fs.readFileSync(csvFilePath, { encoding: 'utf8' })
  // BOMを削除する
  const csvDataWithoutBom = csvData.replace(/^\uFEFF/, '')
  const records: Record[] = parse(csvDataWithoutBom, {
    columns: true,
    skip_empty_lines: true,
  })
  const result: PaymentResult = {}
  for await (const record of records) {
    const paymentMonth = record['支払月'] || dayjs().month() + 1 + '月'
    const totalKey: PaymentTotalKey = `${paymentMonth}支払金額`
    // x月支払金額
    const payment = parseFloat(record[totalKey] || '0')

    if (!isNaN(payment)) {
      result[totalKey] = (result[totalKey] || 0) + payment
    }
  }
  return result
}
