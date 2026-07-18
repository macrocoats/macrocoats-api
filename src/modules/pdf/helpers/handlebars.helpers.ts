import Handlebars from 'handlebars';
import { formatDate, formatTime } from './date.helper.js';
import { formatCurrency, formatNumber } from './currency.helper.js';
import { GHS_PRINT_DIAMOND_SVG } from './ghs-print.helper.js';

export function registerHelpers(): void {
  Handlebars.registerHelper('formatDate', (val: unknown) => formatDate(String(val ?? '')));
  Handlebars.registerHelper('formatTime', (val: unknown) => formatTime(String(val ?? '')));
  Handlebars.registerHelper('formatCurrency', (val: unknown) => formatCurrency(Number(val ?? 0)));
  Handlebars.registerHelper('formatNumber', (val: unknown, decimals: unknown) =>
    formatNumber(Number(val ?? 0), typeof decimals === 'number' ? decimals : 2),
  );

  Handlebars.registerHelper('multiply', (a: unknown, b: unknown) =>
    formatNumber(Number(a) * Number(b)),
  );

  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  Handlebars.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
  Handlebars.registerHelper('and', (a: unknown, b: unknown) => Boolean(a) && Boolean(b));
  Handlebars.registerHelper('or', (a: unknown, b: unknown) => Boolean(a) || Boolean(b));

  Handlebars.registerHelper('inc', (val: unknown) => Number(val) + 1);

  Handlebars.registerHelper('statusClass', (status: unknown) => {
    const map: Record<string, string> = {
      PASS: 'status-pass', pass: 'status-pass', Pass: 'status-pass',
      FAIL: 'status-fail', fail: 'status-fail', Fail: 'status-fail',
      NA: 'status-na',
    };
    return map[String(status)] ?? '';
  });

  Handlebars.registerHelper('conclusionClass', (val: unknown) => {
    const map: Record<string, string> = {
      APPROVED: 'conclusion-approved',
      REJECTED: 'conclusion-rejected',
      CONDITIONAL: 'conclusion-conditional',
    };
    return map[String(val)] ?? '';
  });

  Handlebars.registerHelper('join', (arr: unknown, sep: unknown) => {
    if (!Array.isArray(arr)) return '';
    return arr.join(typeof sep === 'string' ? sep : ', ');
  });

  Handlebars.registerHelper('ghsDiamond', (key: unknown) =>
    new Handlebars.SafeString(GHS_PRINT_DIAMOND_SVG[String(key)] ?? ''),
  );

  Handlebars.registerHelper('isArray', (val: unknown) => Array.isArray(val));
  Handlebars.registerHelper('isObject', (val: unknown) => val !== null && typeof val === 'object' && !Array.isArray(val));
  Handlebars.registerHelper('objectEntries', (val: unknown) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return Object.entries(val as Record<string, unknown>).map(([key, value]) => ({ key, value }));
    }
    return [];
  });
}
