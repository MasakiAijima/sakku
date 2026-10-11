import {handle,identity,database,json,readBody} from "../../../lib/http";
import {getPreferences,savePreferences} from "../../../lib/preferences";
export const dynamic="force-dynamic";
export const GET=()=>handle(async()=>json({settings:await getPreferences(database(),await identity())}));
export const PUT=(r:Request)=>handle(async()=>json({settings:await savePreferences(database(),await identity(),await readBody(r))}));
