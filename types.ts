
export type MonthString = '1月' | '2月' | '3月' | '4月' | '5月' | '6月' | '7月' | '8月' | '9月' | '10月' | '11月' | '12月';
export type PaymentTotalKey = `${MonthString}支払金額`;
export type CarriedOverBalance = `${MonthString}繰越残高`;
export type RemainingPayment = `${MonthString}以降支払金額`;

export type Record = {
    [key in PaymentTotalKey]?: string
} &
    {
        [key in CarriedOverBalance]?: string
    }
    &
    {
        [key in RemainingPayment]?: string
    }
    & {
        '利用日': string;
        '利用店名・商品名': string;
        '利用者': string;
        '支払方法': string;
        '利用金額': string;
        '支払手数料': string;
        '支払総額': string;
        '支払月': MonthString;
    }

export type PaymentResult = {
    [key in PaymentTotalKey]?: number
}