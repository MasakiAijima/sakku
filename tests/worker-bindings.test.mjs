import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("built Worker has exactly one DB and BUCKET binding", () => {
  const config = JSON.parse(readFileSync(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  assert.deepEqual(config.d1_databases.map(({ binding }) => binding), ["DB"]);
  assert.deepEqual(config.r2_buckets.map(({ binding }) => binding), ["BUCKET"]);
});
