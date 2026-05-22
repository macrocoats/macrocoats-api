export function formatDate(value: string | Date | undefined, locale = 'en-IN'): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(value: string | Date | undefined, locale = 'en-IN'): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function nowFormatted(): { date: string; time: string } {
  const now = new Date();
  return { date: formatDate(now), time: formatTime(now) };
}
