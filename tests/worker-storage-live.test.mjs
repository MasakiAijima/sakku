import test from "node:test";
import assert from "node:assert/strict";

const base = process.env.WORKER_TEST_URL;
assert.ok(base, "Set WORKER_TEST_URL to a local Worker with D1 migrations applied");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const headers = {
  "oai-authenticated-user-id": "issue30-storage-test",
  "oai-authenticated-user-email": "issue30@sites.test",
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

test("photo API persists R2 bytes and D1 metadata and links a record", async () => {
  const form = new FormData();
  form.set("photo", new File([png], "pixel.png", { type: "image/png" }));
  const uploaded = await fetch(new URL("/api/photos", base), { method: "POST", headers, body: form });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const { photo } = await uploaded.json();
  assert.match(photo.id, /^[0-9a-f-]{36}$/);
  const saved = await fetch(new URL(photo.url, base), { headers });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("content-type"), "image/png");
  assert.equal(saved.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()), png);

  const created = await fetch(new URL("/api/records", base), {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ createKey: crypto.randomUUID(), sceneText: "Worker storage test", haikuText: "", recordDate: "2026-10-17", status: "draft", photoId: photo.id }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const { record } = await created.json();
  const reloaded = await fetch(new URL(`/api/records/${record.id}`, base), { headers });
  assert.equal(reloaded.status, 200);
  assert.equal((await reloaded.json()).record.photo_id, photo.id);
});

test("photo API rejects invalid images and missing photos", async () => {
  const form = new FormData();
  form.set("photo", new File(["invalid"], "fake.png", { type: "image/png" }));
  const invalid = await fetch(new URL("/api/photos", base), { method: "POST", headers, body: form });
  assert.equal(invalid.status, 422);
  const missing = await fetch(new URL(`/api/photos/${crypto.randomUUID()}`, base), { headers });
  assert.equal(missing.status, 404);
});
