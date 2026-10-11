export type HaikuCandidate={id:string;title:string;lines:[string,string,string]};
/** Reject incomplete generation results; never fill missing poems with samples. */
export function parseHaikuCandidates(value:unknown):HaikuCandidate[]{
 if(!Array.isArray(value)||value.length!==3)throw new Error("Haikuの候補を受け取れませんでした。もう一度お試しください。");
 const candidates=value.map((candidate,i)=>{
  if(!candidate||typeof candidate.title!=="string"||!candidate.title.trim()||!Array.isArray(candidate.lines)||candidate.lines.length!==3||candidate.lines.some((line:unknown)=>typeof line!=="string"||!line.trim()||/[\r\n]/.test(line)))throw new Error("Haikuの候補を受け取れませんでした。もう一度お試しください。");
  return {id:String(i),title:candidate.title,lines:candidate.lines as [string,string,string]};
 });return candidates;
}
export function canCompleteScene(scene:string,haiku:string,chosenForScene:string|null){return !!scene.trim()&&!!haiku.trim()&&chosenForScene===scene;}
