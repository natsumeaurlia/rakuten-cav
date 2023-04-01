import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import type { PaymentResult, PaymentTotalKey, Record } from './types';

export async function sumTotalPayment(downloadDir: string) {
  // ファイル一覧を取得
  const files = fs.readdirSync(downloadDir);
  const result: PaymentResult[] = [];
  for (const file of files) {
    // 拡張子がcsvのファイルのみ処理する
    if (path.extname(file) === '.csv') {
      const csvData = fs.readFileSync(path.join(downloadDir, file), { encoding: 'utf8' });
      // BOMを削除する
      const csvDataWithoutBom = csvData.replace(/^\uFEFF/, '');
      const records: Record[] = parse(csvDataWithoutBom, {
        columns: true,
        skip_empty_lines: true,
      });
      let fileResult: PaymentResult = {};
      for await (const record of records) {
        const paymentMonth = record['支払月']
        const totalKey: PaymentTotalKey = `${paymentMonth}支払金額`
        // x月支払金額
        const payment = parseFloat(record[totalKey] || '0');
        
        if (!isNaN(payment)) {
          fileResult[totalKey] = (fileResult[totalKey] || 0) + payment;
        }
      }
      result.push(fileResult);
    }
  }
  return result;
}