import {z} from 'zod';

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return value.slice(0,4) !== '0000' && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
});
const calendarSchema = z.object({
  version:z.string().min(1),
  timeZone:z.enum(['Asia/Tokyo','UTC']),
  master: z.object({
    version:z.string().min(1), risshunId:z.string().min(1),
    kou:z.array(z.object({id:z.string().min(1), order:z.number().int().min(1).max(72), sekkiId:z.string().min(1), position:z.number().int().min(1).max(3)})).length(72),
  }),
  years:z.array(z.object({
    year:z.number().int().min(1).max(9998), masterVersion:z.string().min(1),
    entries:z.array(z.object({kouId:z.string().min(1), date:civilDate})).length(72),
    nextRisshunDate:civilDate,
  })),
});
type Calendar = z.infer<typeof calendarSchema>;
export type OrbitSlot = {
  id:string; order:number; sekkiId:string; position:number; startDate:string; endDate:string;
} & ({kind:'upcoming'; completed:false} | {kind:'current' | 'visited'; completed:true});
export type SeasonalOrbit =
  | {kind:'ready'; year:number; calendarVersion:string; masterVersion:string; timeZone:string; slots:OrbitSlot[]; nextBoundaryDate:string | null}
  | {kind:'unavailable'; reason:'invalid-calendar' | 'invalid-instant' | 'missing-year' | 'version-mismatch' | 'invalid-year'; year:number};

function localDate(instant:Date, timeZone:string):string {
  const parts = new Intl.DateTimeFormat('en', {timeZone, year:'numeric', month:'2-digit', day:'2-digit', era:'short'}).formatToParts(instant);
  const part = (type:string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year').padStart(4,'0')}-${part('month')}-${part('day')}`;
}

/** Calendar entry dates are civil dates in the explicitly supplied calendar time zone. */
export function seasonalOrbit({calendar, year, now}:{calendar:unknown; year:number; now:Date}):SeasonalOrbit {
  const unavailable = (reason:Extract<SeasonalOrbit,{kind:'unavailable'}>['reason']):SeasonalOrbit => ({kind:'unavailable', reason, year});
  if (!Number.isInteger(year) || year < 1 || year > 9998) return unavailable('invalid-year');
  if (!Number.isFinite(now.getTime())) return unavailable('invalid-instant');
  const parsed = calendarSchema.safeParse(calendar);
  if (!parsed.success) return unavailable('invalid-calendar');
  const data:Calendar = parsed.data;
  if (data.timeZone === 'Asia/Tokyo' && data.years.some(value=>value.year < 1952)) return unavailable('invalid-calendar');
  const master = [...data.master.kou].sort((a,b) => a.order-b.order);
  if (new Set(master.map(kou=>kou.id)).size !== 72 || master.some((kou,index)=>kou.order !== index+1) || master[0]?.id !== data.master.risshunId || new Set(data.years.map(value=>value.year)).size !== data.years.length) return unavailable('invalid-calendar');
  const sekkiIds = new Set<string>();
  for (let index=0; index<72; index+=3) {
    const group=master.slice(index,index+3);
    const id=group[0]?.sekkiId;
    if (!id || sekkiIds.has(id) || group.some((kou,offset)=>kou.sekkiId !== id || kou.position !== offset+1)) return unavailable('invalid-calendar');
    sekkiIds.add(id);
  }
  const selected = data.years.find(value=>value.year === year);
  if (!selected) return unavailable('missing-year');
  if (selected.masterVersion !== data.master.version) return unavailable('version-mismatch');
  const entries = new Map(selected.entries.map(entry=>[entry.kouId,entry.date]));
  if (entries.size !== 72) return unavailable('invalid-calendar');
  const dates = master.map(kou=>entries.get(kou.id));
  const first = dates[0];
  const next = selected.nextRisshunDate;
  if (!first || first.slice(0,7) !== `${String(year).padStart(4,'0')}-02` || next.slice(0,7) !== `${String(year+1).padStart(4,'0')}-02`) return unavailable('invalid-calendar');
  const following=data.years.find(value=>value.year === year+1);
  if (following && (following.masterVersion !== data.master.version || following.entries.find(entry=>entry.kouId === data.master.risshunId)?.date !== next)) return unavailable('invalid-calendar');
  const today = localDate(now,data.timeZone);
  const slots:OrbitSlot[] = [];
  for (const [index,kou] of master.entries()) {
    const startDate = dates[index];
    const endDate = dates[index+1] ?? next;
    if (!startDate || !endDate || startDate >= endDate) return unavailable('invalid-calendar');
    const range = {id:kou.id, order:kou.order, sekkiId:kou.sekkiId, position:kou.position, startDate, endDate};
    slots.push(today < startDate ? {...range, kind:'upcoming', completed:false} : {...range, kind:today < endDate ? 'current' : 'visited', completed:true});
  }
  return {kind:'ready', year, calendarVersion:data.version, masterVersion:data.master.version, timeZone:data.timeZone, slots,
    nextBoundaryDate:[...slots.map(slot=>slot.startDate),next].find(date=>date > today) ?? null};
}

/** Fixed-offset supported calendars have monotonic civil dates across this search. */
export function nextOrbitBoundary({orbit,now}:{orbit:SeasonalOrbit; now:Date}):number | null {
  if (orbit.kind !== 'ready' || !orbit.nextBoundaryDate || !Number.isFinite(now.getTime())) return null;
  const target = orbit.nextBoundaryDate;
  let low = now.getTime();
  let high = Math.max(low+86400000, Date.parse(`${target}T00:00:00Z`)+3*86400000);
  if (localDate(new Date(high),orbit.timeZone) < target) return null;
  while (high-low > 1) {
    const middle = Math.floor((low+high)/2);
    if (localDate(new Date(middle),orbit.timeZone) < target) low=middle;
    else high=middle;
  }
  return high;
}

/** Resolve the seasonal year only from supplied and validated Risshun intervals. */
export function seasonalYear({calendar,now}:{calendar:unknown; now:Date}):number | null {
  const parsed=calendarSchema.safeParse(calendar);
  if (!parsed.success || !Number.isFinite(now.getTime())) return null;
  const matches=parsed.data.years.filter(({year})=> {
    const orbit=seasonalOrbit({calendar,year,now});
    return orbit.kind === 'ready' && orbit.slots.some(slot=>slot.kind === 'current');
  });
  return matches.length === 1 ? matches[0].year : null;
}
