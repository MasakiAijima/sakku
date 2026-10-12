/// <reference types="vite/client" />
import {z} from 'zod';
import pointer from '../data/calendar/current.json';

const editions:Record<string,unknown>=import.meta.glob('../data/calendar/versions/*.json',{eager:true,import:'default'});
const selected=editions[`../${pointer.path}`];
const presentationSchema=z.object({version:z.literal(pointer.version),master:z.object({kou:z.array(z.object({id:z.string(),name:z.string(),reading:z.string(),sekki:z.string()}))}),years:z.array(z.object({year:z.number().int()}))});
const presentation=presentationSchema.safeParse(selected);
export const orbitCalendarProps=presentation.success?{
  calendar:selected,names:presentation.data.master.kou,years:presentation.data.years.map(value=>value.year),
}:{calendar:null,names:[],years:[]};
