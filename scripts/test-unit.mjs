import {spawnSync} from 'node:child_process';

const source = ['lib/records.ts', 'lib/record-query.ts', 'lib/validation.ts',
  'shared/haiku.ts', 'lib/preferences.ts', 'lib/haiku-provider.ts',
  'lib/haiku-translation.ts', 'shared/photo.ts', 'lib/bounded-body.ts', 'shared/seasonal-orbit.ts', 'shared/seasonal-orbit-browser.ts'];
for (const args of [
  ['node_modules/typescript/bin/tsc', '--outDir', '.sites-runtime/test-lib',
    '--noEmit', 'false', '--module', 'nodenext', '--moduleResolution', 'nodenext',
    '--target', 'es2022', '--skipLibCheck', '--types', 'node,@cloudflare/workers-types', ...source],
  ['--test', 'tests/archive.test.mjs', 'tests/storage.test.mjs', 'tests/seasonal-orbit.test.mjs', 'tests/calendar.test.mjs'],
]) {
  const result = spawnSync(process.execPath, args, {stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
