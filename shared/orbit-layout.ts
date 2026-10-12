export type Bounds = {x:number; y:number; width:number; height:number};
export type OrbitPlacement = {
  id:string; angle:number; x:number; y:number; scale:number; offsetX:number; offsetY:number;
  artworkBounds:Bounds; touchBounds:Bounds; staticZ:number; motionBounds:Bounds; artwork: {kind:"provisional"} | {kind:"static"; upcomingSrc:string; completedSrc:string};
};
export const orbitLayout:readonly OrbitPlacement[] = Array.from({length:72},(_,index)=>{
  const angle=-135+index*5;
  const radians=angle*Math.PI/180;
  return {id:`kou-${String(index+1).padStart(2,'0')}`,angle,
    x:300+220*Math.cos(radians),y:300+220*Math.sin(radians),scale:1,offsetX:0,offsetY:0,
    artworkBounds:{x:-12,y:-12,width:24,height:24},
    touchBounds:{x:-15,y:-15,width:30,height:30},
    motionBounds:{x:-14,y:-14,width:28,height:28},staticZ:index,artwork:{kind:"provisional"}};
});
export function worldBounds(placement:OrbitPlacement,bounds:Bounds):Bounds {
  return {x:placement.x+placement.offsetX+bounds.x*placement.scale,
    y:placement.y+placement.offsetY+bounds.y*placement.scale,
    width:bounds.width*placement.scale,height:bounds.height*placement.scale};
}
export function orderedPlacements(placements:readonly OrbitPlacement[],selected:string|null=null):OrbitPlacement[] {
  return [...placements].sort((a,b)=>Number(a.id===selected)-Number(b.id===selected)||a.staticZ-b.staticZ||a.id.localeCompare(b.id));
}
function contains(bounds:Bounds,x:number,y:number):boolean {
  return x>=bounds.x && x<=bounds.x+bounds.width && y>=bounds.y && y<=bounds.y+bounds.height;
}
export function orbitOverlapReview(placements:readonly OrbitPlacement[]=orbitLayout) {
  const ordered=orderedPlacements(placements);
  return ordered.map((item,index)=>{
    const own=worldBounds(item,item.artworkBounds);
    const later=ordered.slice(index+1).map(p=>worldBounds(p,p.artworkBounds));
    let visibleSamples=0;
    for(let y=0;y<=12;y++)for(let x=0;x<=12;x++) {
      if(!later.some(bounds=>contains(bounds,own.x+own.width*x/12,own.y+own.height*y/12)))visibleSamples++;
    }
    const motion=worldBounds(item,item.motionBounds);
    const collisions=ordered.filter(other=>other.id!==item.id).filter(other=>{
      const bounds=worldBounds(other,other.motionBounds);
      return motion.x<bounds.x+bounds.width && motion.x+motion.width>bounds.x && motion.y<bounds.y+bounds.height && motion.y+motion.height>bounds.y;
    }).map(other=>other.id);
    return {id:item.id,visibleSamples,collisions};
  });
}
