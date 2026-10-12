import {seasonalOrbit, nextOrbitBoundary, type SeasonalOrbit} from './seasonal-orbit.js';

/** Recompute on start, browser resume, and the next supplied calendar boundary. */
export function watchSeasonalOrbit({calendar, year, onChange, window:host=window}:{
  calendar:unknown; year:number; onChange:(orbit:SeasonalOrbit)=>void; window?:Window;
}):()=>void {
  let timer:number | undefined;
  let disposed=false;
  function refresh() {
    if (disposed) return;
    host.clearTimeout(timer);
    const now=new Date();
    const orbit=seasonalOrbit({calendar,year,now});
    const boundary=nextOrbitBoundary({orbit,now});
    if (boundary !== null) timer=host.setTimeout(refresh,Math.min(2147483647,Math.max(1,boundary-now.getTime())));
    onChange(orbit);
  }
  host.addEventListener('pageshow',refresh);
  host.addEventListener('focus',refresh);
  host.document.addEventListener('visibilitychange',refresh);
  refresh();
  return () => {
    disposed=true;
    host.clearTimeout(timer);
    host.removeEventListener('pageshow',refresh);
    host.removeEventListener('focus',refresh);
    host.document.removeEventListener('visibilitychange',refresh);
  };
}
