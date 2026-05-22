export function formatCurrency(value: number | undefined, symbol = '₹'): string {
  if (value === undefined || value === null) return '';
  return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | undefined, decimals = 2): string {
  if (value === undefined || value === null) return '';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function wordsBelow1000(n: number): string {
  if (n < 20) return ones[n] ?? '';
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + wordsBelow1000(n % 100) : '');
}

export function amountInWords(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return 'Zero Rupees Only';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(wordsBelow1000(crore) + ' Crore');
  if (lakh) parts.push(wordsBelow1000(lakh) + ' Lakh');
  if (thousand) parts.push(wordsBelow1000(thousand) + ' Thousand');
  if (rest) parts.push(wordsBelow1000(rest));
  return parts.join(' ') + ' Rupees Only';
}
