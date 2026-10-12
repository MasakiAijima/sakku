import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCalendar,canonical,requireCoverage,validateManifest} from './calendar-normalize.mjs';

export async function generate({root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),check=false,requiredYear}={}) {
  const manifest=JSON.parse(await readFile(resolve(root,'data/calendar/manifest.json'),'utf8'));
  validateManifest(manifest);
  const sources=[];
  for (const source of manifest.sources) sources.push({...source,bytes:await readFile(resolve(root,source.path))});
  const calendar=buildCalendar({sources,coverage:manifest.coverage});
  if (requiredYear !== undefined) requireCoverage(calendar,requiredYear);
  const versionPath=`data/calendar/versions/${calendar.version}.json`;
  const pointer={version:calendar.version,path:versionPath};
  const files=[[versionPath,canonical(calendar)],['data/calendar/current.json',canonical(pointer)]];
  for (const [path,bytes] of files) {
    const target=resolve(root,path);
    let old; try { old=await readFile(target,'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (old === bytes) continue;
    if (check) throw new Error(`Generated calendar differs: ${path}`);
    if (path === versionPath && old !== undefined) throw new Error('Immutable calendar version already exists with different content');
    await mkdir(dirname(target),{recursive:true});
    const temporary=`${target}.tmp-${process.pid}`;
    await writeFile(temporary,bytes); await rename(temporary,target);
  }
  return calendar;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  const yearArg=args.find(arg=>arg.startsWith('--require-year='));
  if (args.some(arg=>arg !== '--check' && !arg.startsWith('--require-year=')) || (yearArg && !/^--require-year=\d{4}$/.test(yearArg))) { console.error('Usage: node scripts/calendar.mjs [--check] [--require-year=YYYY]'); process.exitCode=1; }
  else try { const result=await generate({check:args.includes('--check'),requiredYear:yearArg ? Number(yearArg.split('=')[1]):undefined}); console.log(`Calendar ${result.version}: ${result.years.length} seasonal years validated`); } catch (error) { console.error(error.message); process.exitCode=1; }
}
