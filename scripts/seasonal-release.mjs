#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir, rm, cp, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const digest = data => createHash('sha256').update(data).digest('hex');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const versionName = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) || value.includes('..')) throw Error('Invalid release version');
  return value;
};
async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
async function optionalJson(file, fallback) {
  try { return await readJson(file); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function localFile(directory, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(part => part === '..' || part === '.' || !part)) throw Error('Invalid release asset path');
  const file = path.resolve(directory, relative);
  const actual = await realpath(file);
  const base = await realpath(directory);
  if (!actual.startsWith(`${base}${path.sep}`) || !(await lstat(actual)).isFile()) throw Error('Asset escapes release or is not a file');
  return actual;
}
export async function productionCheck(version, directory) {
  const python = process.env.SEASONAL_PYTHON || 'python3';
  const result = spawnSync(python, [path.join(root, 'scripts/package-seasonal-release.py'), '--version', version, '--check', '--release-root', path.dirname(directory)], { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw Error(`Production image validation failed: ${result.error?.message || result.stderr || result.stdout}`);
}
export async function validateRelease(base, version, { validator = productionCheck } = {}) {
  versionName(version);
  const directory = path.join(base, 'releases', version);
  const releaseRoot = await realpath(path.join(base, 'releases'));
  if (!(await realpath(directory)).startsWith(`${releaseRoot}${path.sep}`)) throw Error('Release escapes release root');
  const manifestFile = await localFile(directory, 'manifest.json');
  const manifest = await readJson(manifestFile);
  if (manifest.schemaVersion !== 2 || manifest.version !== version || !['review', 'approved'].includes(manifest.status)) throw Error('Invalid release manifest');
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 72) throw Error('Release requires 72 assets');
  for (let index = 0; index < 72; index++) {
    const asset = manifest.assets[index];
    if (asset.kouId !== `kou-${String(index + 1).padStart(2, '0')}`) throw Error('Noncanonical asset IDs');
    for (const key of ['initial', 'completed', 'transition', 'idle', 'provenance']) {
      const file = await localFile(directory, asset[key]);
      if (!/^[a-f0-9]{64}$/.test(asset.hashes?.[key] || '') || digest(await readFile(file)) !== asset.hashes[key]) throw Error(`Hash mismatch: ${asset.kouId}/${key}`);
    }
  }
  await validator(version, directory, manifest);
  return { directory, manifest, sha256: digest(await readFile(manifestFile)) };
}
async function locked(base, action) {
  await mkdir(base, { recursive: true });
  const lock = path.join(base, '.release-operation.lock');
  await mkdir(lock);
  try { return await action(); } finally { await rm(lock, { recursive: true }); }
}
const pointer = (version, sha256) => ({ schemaVersion: 1, version, manifest: `releases/${version}/manifest.json`, sha256 });
async function selectRelease(base, version, options, action) {
  const release = await validateRelease(base, version, options);
  if (options.expectedSHA && release.sha256 !== options.expectedSHA) throw Error('Previous manifest hash mismatch');
  const currentFile = path.join(base, 'current.json');
  const previous = await optionalJson(currentFile, null);
  const historyFile = path.join(base, 'release-history.json');
  const history = await optionalJson(historyFile, []);
  if (!Array.isArray(history)) throw Error('Invalid release history');
  const manifestFile = path.join(release.directory, 'manifest.json');
  const before = await readFile(manifestFile);
  let updated = false;
  try {
    if (release.manifest.status !== 'approved') {
      if (action !== 'promote' || !options.approveArt) throw Error('Release requires explicit art approval');
      await atomicJson(manifestFile, { ...release.manifest, status: 'approved' });
      updated = true;
    }
    const selected = pointer(version, digest(await readFile(manifestFile)));
    history.push({ action, at: new Date().toISOString(), previous, current: selected, manifestSHA256: selected.sha256 });
    // History is committed first; current remains unchanged if its write fails.
    await atomicJson(historyFile, history);
    await atomicJson(currentFile, selected);
    return selected;
  } catch (error) {
    if (updated) {
      const temporary = `${manifestFile}.${randomUUID()}.restore`;
      await writeFile(temporary, before); await rename(temporary, manifestFile);
    }
    throw error;
  }
}
export async function promoteRelease(base, version, options = {}) {
  if (!options.approveArt) throw Error('Promotion requires --approve-art');
  return locked(base, () => selectRelease(base, version, options, 'promote'));
}
export async function rollbackRelease(base, options = {}) {
  return locked(base, async () => {
    const current = await readJson(path.join(base, 'current.json'));
    const history = await readJson(path.join(base, 'release-history.json'));
    const entry = [...history].reverse().find(item => item.current?.version === current.version && item.previous?.version !== current.version && item.previous?.version);
    if (!entry) throw Error('No previous release available');
    return selectRelease(base, entry.previous.version, { ...options, expectedSHA: entry.previous.sha256 }, 'rollback');
  });
}
export async function exportRelease(base, version, output, options = {}) {
  return locked(base, async () => {
    const release = await validateRelease(base, version, options);
    if (release.manifest.status !== 'approved') throw Error('Only approved releases can be exported');
    // Exclusive creation prevents accidental overwrite of an existing export.
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(output);
    try {
      const assets = path.join(output, 'public/seasonal-assets');
      const target = path.join(assets, 'releases', version);
      await mkdir(target, { recursive: true });
      await cp(path.join(release.directory, 'manifest.json'), path.join(target, 'manifest.json'));
      for (const asset of release.manifest.assets) for (const key of ['initial', 'completed', 'transition', 'idle', 'provenance']) {
        const source = await localFile(release.directory, asset[key]);
        const destination = path.join(target, asset[key]);
        await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination);
      }
      for (const asset of release.manifest.assets) {
        const relative = `${asset.kouId}/record.json`;
        try {
          const source = await localFile(release.directory, relative);
          await cp(source, path.join(target, relative));
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      // Public preview shell is optional for library fixtures; production exports
      // include only these audited files, never unrelated pages or credentials.
      for (const filename of ['release-review.html', 'release-review.js', 'poc-loader.js', 'release-worker.js', 'offline-home.html', 'offline-home.js', 'seasonal-art-runtime.js', 'offline-calendar.json']) {
        try {
          const source = await localFile(base, filename);
          if (filename === 'release-review.html') {
            const html = (await readFile(source, 'utf8')).replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '<nav>SAKKU</nav>');
            await writeFile(path.join(assets, filename), html);
          }
          else await cp(source, path.join(assets, filename));
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      await atomicJson(path.join(assets, 'current.json'), pointer(version, release.sha256));
      await validateRelease(assets, version, options);
      await writeFile(path.join(output, 'README.md'), `# SAKKU seasonal release ${version}\n\nFrom this directory run:\n\n\`python3 -m http.server 8790 --directory public\`\n\nOpen http://127.0.0.1:8790/seasonal-assets/release-review.html\n\nUse the preview's offline preparation while online before disconnecting. If offline preparation is unavailable, the bundled local images and static preview remain available while this local server runs.\n`);
      return { output, version };
    } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
  });
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--approve-art') values.approveArt = true;
    else if (['--version', '--output'].includes(argument) && args[index + 1]) values[argument.slice(2)] = args[++index];
    else throw Error(`Unknown or incomplete argument: ${argument}`);
  }
  const base = path.join(root, 'public/seasonal-assets');
  let result;
  if (command === 'validate') result = await locked(base, () => validateRelease(base, values.version));
  else if (command === 'promote') result = await promoteRelease(base, values.version, values);
  else if (command === 'rollback') result = await rollbackRelease(base);
  else if (command === 'export' && values.output) result = await exportRelease(base, values.version, path.resolve(values.output));
  else throw Error('Usage: seasonal-release.mjs validate|promote|rollback|export --version VERSION [--approve-art] [--output DIRECTORY]');
  console.log(JSON.stringify(command === 'validate' ? { version: result.manifest.version, sha256: result.sha256, valid: true } : result));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
