/// <reference types="vite/client" />
import pointer from '../public/seasonal-assets/current.json';
import {approvedSeasonalArt} from '../shared/seasonal-art';
const editions:Record<string,unknown>=import.meta.glob('../public/seasonal-assets/releases/*/manifest.json',{eager:true,query:'?raw',import:'default'});
export function loadSeasonalArt(){const source=editions[`../public/seasonal-assets/${pointer.manifest}`];return approvedSeasonalArt({pointer,source:typeof source==='string'?source:undefined});}
