import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { digest, validateRelease, promoteRelease, rollbackRelease, exportRelease } from '../scripts/seasonal-release.mjs';

const options = { validator: async () => {}, approveArt: true };
async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'seasonal-release-'));
  async function release(version) {
    const directory = path.join(base, 'releases', version);
    await mkdir(directory, { recursive: true });
    const assets = [];
    for (let index = 1; index <= 72; index++) {
      const kouId = `kou-${String(index).padStart(2, '0')}`;
      await mkdir(path.join(directory, kouId));
      const asset = { kouId, hashes: {} };
      for (const key of ['initial', 'completed', 'transition', 'idle', 'provenance']) {
        asset[key] = `${kouId}/${key}.${key === 'provenance' ? 'json' : 'png'}`;
        const bytes = Buffer.from(`${version}/${kouId}/${key}`);
        await writeFile(path.join(directory, asset[key]), bytes);
        asset.hashes[key] = digest(bytes);
      }
      assets.push(asset);
    }
    const manifest = { schemaVersion: 2, version, status: 'review', assets };
    const file = path.join(directory, 'manifest.json');
    await writeFile(file, JSON.stringify(manifest));
    return { directory, file, manifest };
  }
  return { base, release };
}
test('promote, restore previous release, and export a standalone validated bundle', async () => {
  const { base, release } = await fixture();
  try {
    await release('a-v1'); await release('c-v1');
    await assert.rejects(promoteRelease(base, 'a-v1', { validator: options.validator }), /approve-art/);
    await promoteRelease(base, 'a-v1', options);
    await promoteRelease(base, 'c-v1', options);
    assert.equal((await rollbackRelease(base, options)).version, 'a-v1');
    await writeFile(path.join(base, 'release-review.html'), '<html>Public review</html>');
    await writeFile(path.join(base, 'private.html'), 'Never export');
    await writeFile(path.join(base, 'releases/a-v1/kou-01/record.json'), '{"record":true}');
    const output = path.join(base, 'nested/export');
    await exportRelease(base, 'a-v1', output, options);
    const exportedBase = path.join(output, 'public/seasonal-assets');
    assert.equal((await validateRelease(exportedBase, 'a-v1', options)).manifest.assets.length, 72);
    assert.equal(await readFile(path.join(exportedBase, 'release-review.html'), 'utf8'), '<html>Public review</html>');
    assert.equal(await readFile(path.join(exportedBase, 'releases/a-v1/kou-01/record.json'), 'utf8'), '{"record":true}');
    assert.match(await readFile(path.join(output, 'README.md'), 'utf8'), /http.server 8790/);
    await assert.rejects(readFile(path.join(exportedBase, 'private.html')), { code: 'ENOENT' });
    assert.equal(JSON.parse(await readFile(path.join(exportedBase, 'current.json'))).manifest, 'releases/a-v1/manifest.json');
    await assert.rejects(exportRelease(base, 'a-v1', output, options), /EEXIST/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
test('invalid paths, tampering, missing canonical IDs, and failed image validation never change current', async () => {
  const { base, release } = await fixture();
  try {
    await release('a-v1'); await promoteRelease(base, 'a-v1', options);
    const currentFile = path.join(base, 'current.json');
    const before = await readFile(currentFile, 'utf8');
    for (const mutation of [m => { m.assets[0].initial = '../escape.png'; }, m => { m.assets.pop(); }, m => { m.assets[0].hashes.idle = '0'.repeat(64); }]) {
      const candidate = await release(`bad-${Math.random().toString(36).slice(2)}`);
      mutation(candidate.manifest); await writeFile(candidate.file, JSON.stringify(candidate.manifest));
      await assert.rejects(promoteRelease(base, candidate.manifest.version, options));
      assert.equal(await readFile(currentFile, 'utf8'), before);
    }
    const candidate = await release('c-v1');
    await assert.rejects(promoteRelease(base, 'c-v1', { approveArt: true, validator: async () => { throw Error('Bad animation'); } }), /Bad animation/);
    assert.equal(await readFile(currentFile, 'utf8'), before);
    assert.equal(JSON.parse(await readFile(candidate.file)).status, 'review');
    await promoteRelease(base, 'c-v1', options);
    const selected = await readFile(currentFile, 'utf8');
    await writeFile(path.join(base, 'releases/a-v1/kou-01/initial.png'), 'tamper');
    await assert.rejects(rollbackRelease(base, options), /Hash mismatch/);
    assert.equal(await readFile(currentFile, 'utf8'), selected);
  } finally { await rm(base, { recursive: true, force: true }); }
});
