export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number(value.slice(0, 4)) >= 1 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function periodRange(period) {
  if (period.kind === 'all') return {};
  if (period.kind === 'year') {
    if (!/^\d{4}$/.test(period.year) || Number(period.year) < 1 || Number(period.year) > 9998) throw Error('年は0001〜9998で指定してください。');
    return {from: period.year + '-01-01', to: String(Number(period.year) + 1).padStart(4, '0') + '-01-01'};
  }
  if (period.kind === 'day') {
    if (!validDate(period.date) || period.date === '9999-12-31') throw Error('有効な日付を指定してください。');
    const date = new Date(period.date + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return {from: period.date, to: date.toISOString().slice(0, 10)};
  }
  if (!['kou', 'sekki'].includes(period.kind)) throw Error('閲覧単位を選んでください。');
  if (!validDate(period.from) || !validDate(period.to) || period.from >= period.to) throw Error('開始日より後の終了日を指定してください。');
  return {from: period.from, to: period.to};
}

export function recordsQuery(range, cursor) {
  const query = new URLSearchParams(range);
  if (cursor) query.set('cursor', cursor);
  return '/api/records' + (query.size ? '?' + query.toString() : '');
}
