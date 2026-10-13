import {z} from 'zod';
const finite=z.number().finite();
const pixel=finite.min(0).max(512);
const bounds=z.tuple([pixel,pixel,pixel,pixel]).refine(([x,y,right,bottom])=>x<right&&y<bottom);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const version=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const asset=z.object({
  kouId:z.string().regex(/^kou-(0[1-9]|[1-6][0-9]|7[0-2])$/),name:z.string().min(1),
  width:z.literal(512),height:z.literal(512),anchor:z.object({x:z.literal(.5),y:z.literal(.5)}),
  transparent:z.literal(true),colorSpace:z.literal('sRGB'),
  initial:z.string(),completed:z.string(),transition:z.string(),idle:z.string(),provenance:z.string(),
  hashes:z.object({initial:hash,completed:hash,transition:hash,idle:hash,provenance:hash}),
  placement:z.object({x:finite.min(0).max(700),y:finite.min(0).max(700),visibleCenter:z.tuple([pixel,pixel]),visibleLongEdge:z.literal(306)}),
  visibleBounds:bounds,precursorBounds:bounds,
  motionBounds:z.object({x:pixel,y:pixel,width:finite.positive().max(512),height:finite.positive().max(512)}),
  animation:z.object({seed:z.tuple([pixel,pixel]),durationMs:z.literal(720),frames:z.number().int().min(2),loop:z.literal(false),idle:z.literal('static')}),
}).superRefine((value,context)=>{
  const b=value.visibleBounds,p=value.precursorBounds,center=value.placement.visibleCenter,m=value.motionBounds;
  const files={initial:'initial.png',completed:'completed.png',transition:'transition.webp',idle:'idle.png',provenance:'provenance.json'};
  for(const state of ['initial','completed','transition','idle','provenance'] as const)if(value[state]!==`${value.kouId}/${files[state]}`)context.addIssue({code:'custom',message:'Invalid asset path'});
  if(center[0]!==((b[0]+b[2])/2)||center[1]!==((b[1]+b[3])/2)||m.x!==b[0]||m.y!==b[1]||m.width!==b[2]-b[0]||m.height!==b[3]-b[1]||p[0]<b[0]||p[1]<b[1]||p[2]>b[2]||p[3]>b[3]||value.animation.seed[0]!==((p[0]+p[2])/2)||value.animation.seed[1]!==((p[1]+p[3])/2))context.addIssue({code:'custom',message:'Invalid asset geometry'});
});
export const seasonalArtSchema=z.object({
  schemaVersion:z.literal(2),version,status:z.literal('approved'),
  layout:z.object({viewBox:z.tuple([z.literal(0),z.literal(0),z.literal(700),z.literal(700)]),commonVisibleLongEdge:finite.positive().max(55.31)}),
  animation:z.object({kind:z.literal('organic-growth'),durationMs:z.literal(720),staggerMs:z.literal(45),idle:z.literal('static')}),
  assets:z.array(asset).length(72),
}).refine(value=>value.assets.every((item,index)=>item.kouId===`kou-${String(index+1).padStart(2,'0')}`),'Expected canonical 72 assets');
export type SeasonalArt=z.infer<typeof seasonalArtSchema>;
const pointerSchema=z.object({schemaVersion:z.literal(1),version,manifest:z.string(),sha256:hash}).refine(value=>value.manifest===`releases/${value.version}/manifest.json`);
export async function approvedSeasonalArt({pointer,source}:{pointer:unknown;source:string|undefined}):Promise<SeasonalArt|null>{
  const selected=pointerSchema.safeParse(pointer);
  if(!selected.success||!source)return null;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  if(Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')!==selected.data.sha256)return null;
  try{const parsed=seasonalArtSchema.safeParse(JSON.parse(source));return parsed.success&&parsed.data.version===selected.data.version?parsed.data:null;}catch{return null;}
}
