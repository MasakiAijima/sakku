import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "sakku-worker-bindings-"));
const persistence = path.join(temporaryRoot, "state");
const env = { ...process.env, SITES_RUNTIME_ROOT: path.join(temporaryRoot, "runtime") };
const wrangler = ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js"];
const children = [];
const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

function start(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
    detached: true,
    signal: controller.signal,
    ...options,
  });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(" ")} exited with ${signal || code}`));
    });
  });
  closed.catch(() => {});
  children.push({ child, closed });
  return { child, closed };
}

function stop(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

try {
  await start(["--test", "tests/worker-bindings.test.mjs"], { timeout: 60_000 }).closed;
  await start([
    ...wrangler, "d1", "migrations", "apply", "DB", "--local",
    "--config", "wrangler.jsonc", "--persist-to", persistence,
  ], { timeout: 60_000 }).closed;

  const worker = start([
    ...wrangler, "dev", "--config", "dist/server/wrangler.json", "--local",
    "--persist-to", persistence, "--ip", "127.0.0.1", "--port", "0", "--inspector-port", "0",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let ready;
  const readyUrl = new Promise((resolve) => { ready = resolve; });
  for (const stream of [worker.child.stdout, worker.child.stderr]) {
    stream.on("data", (chunk) => {
      process.stdout.write(chunk);
      output = (output + chunk.toString()).slice(-16_384);
      const match = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) ready(match[1]);
    });
  }
  const timer = setTimeout(() => controller.abort(new Error("Worker did not become ready within 60 seconds")), 60_000);
  let url;
  try {
    url = await Promise.race([
      readyUrl,
      worker.closed.then(() => { throw new Error("Worker exited before becoming ready"); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  await Promise.race([
    start(["--test", "tests/worker-storage-live.test.mjs"], {
      env: { ...env, WORKER_TEST_URL: url },
      timeout: 60_000,
    }).closed,
    worker.closed.then(() => { throw new Error("Worker exited during storage tests"); }),
  ]);
} catch (error) {
  console.error(controller.signal.reason || error);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  for (const { child } of children) stop(child, "SIGTERM");
  let timer;
  await Promise.race([
    Promise.allSettled(children.map(({ closed }) => closed)),
    new Promise((resolve) => { timer = setTimeout(resolve, 5_000); }),
  ]);
  clearTimeout(timer);
  for (const { child } of children) stop(child, "SIGKILL");
  await rm(temporaryRoot, { recursive: true, force: true });
}
