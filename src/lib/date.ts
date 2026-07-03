export function getDateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isWithinLastDays(value: string, days: number) {
  const compare = new Date(value).getTime();
  const now = Date.now();
  const boundary = now - (days - 1) * 24 * 60 * 60 * 1000;
  return compare >= boundary;
}

export function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export function buildLastNDates(days: number) {
  const end = startOfToday();
  return Array.from({ length: days }, (_, index) => {
    const current = new Date(end);
    current.setDate(end.getDate() - (days - 1 - index));
    return current;
  });
}
