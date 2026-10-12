export function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0,4) !== '0000' && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
}
export function classifyRecordDate({date,calendar,version}) {
  const unavailable = reason => ({kind:'unavailable',reason,date});
  if (!isDate(date)) return unavailable('invalid-date');
  if (!calendar || typeof calendar.version !== 'string' || calendar.timeZone !== 'Asia/Tokyo' || !Array.isArray(calendar.boundaries) || !Array.isArray(calendar.master?.kou) || !Array.isArray(calendar.coverage?.calendarYears)) return unavailable('invalid-calendar');
  if (version !== undefined && version !== calendar.version) return unavailable('version-mismatch');
  const master=calendar.master.kou;
  if (master.length !== 72 || master.some((kou,index)=>!kou || kou.order !== index+1 || kou.id !== `kou-${String(index+1).padStart(2,'0')}`)) return unavailable('invalid-calendar');
  if (calendar.boundaries.some((entry,index,all)=>!entry || !isDate(entry.date) || !master.some(kou=>kou.id === entry.kouId) || (index > 0 && (entry.date <= all[index-1].date || Number(entry.kouId.slice(4)) !== Number(all[index-1].kouId.slice(4))%72+1)))) return unavailable('invalid-calendar');
  if (!calendar.coverage?.calendarYears.includes(Number(date.slice(0,4)))) return unavailable('missing-range');
  const index=calendar.boundaries.findIndex((entry,i,all)=>entry.date <= date && all[i+1]?.date > date);
  if (index < 0) return unavailable('missing-range');
  const boundary=calendar.boundaries[index];
  const kou=calendar.master.kou.find(value=>value.id === boundary.kouId);
  if (!kou) return unavailable('invalid-calendar');
  const calendarYear=Number(date.slice(0,4));
  const risshun=calendar.boundaries.slice(0,index+1).findLast(entry=>entry.kouId === 'kou-01');
  if (!risshun) return unavailable('missing-seasonal-boundary');
  const seasonalYear=Number(risshun.date.slice(0,4));
  return {kind:'ready',date,version:calendar.version,masterVersion:calendar.master.version,calendarYear,seasonalYear,kou,sekki:{id:kou.sekkiId,name:kou.sekki},startDate:boundary.date,endDate:calendar.boundaries[index+1].date};
}
export function exportOrbitCalendar(calendar) {
  return {version:calendar.version,timeZone:calendar.timeZone,master:calendar.master,years:calendar.years};
}
