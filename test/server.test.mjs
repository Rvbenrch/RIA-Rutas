import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { checks } from "../public/checks.mjs";

test("la API conserva una fila diaria al guardar desde dos sesiones y reiniciar", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ria-rutas-test-"));
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ["server.mjs"], {
      env: { ...process.env, PORT: String(port), RIA_DATA_DIR: directory },
      stdio: "ignore", windowsHide: true,
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error("El servidor de prueba terminó antes de arrancar.");
      try { if ((await fetch(origin + "/api/session")).ok) return; }
      catch { /* Wait for the server to listen. */ }
      await setTimeout(50);
    }
    throw new Error("El servidor de prueba no arrancó.");
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, "exit");
      child.kill();
      await exit;
    }
  }
  const post = (path, body, cookie, source = origin) => fetch(origin + path, {
    method: "POST",
    headers: { origin: source, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  try {
    await start();
    assert.equal((await fetch(origin + "/api/state")).status, 401);
    const raw = await readFile(join(directory, "accesos-locales.txt"), "utf8");
    const accounts = new Map(raw.trim().split("\n").map(line => line.split("\t")));
    async function login(account) {
      const response = await post("/api/login", { account, password: accounts.get(account) });
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie").split(";")[0];
    }
    const first = await login("chofer-01");
    const second = await login("chofer-01");
    const coordinator = await login("coordinacion");
    const answers = Object.fromEntries(checks.map(check => [check.id, "OK"]));
    const review = { trip: "V01", action: "inspection", answers };
    assert.equal((await post("/api/action", review, first, "https://example.invalid")).status, 403);
    assert.equal((await post("/api/action", { ...review, trip: "V02" }, first)).status, 400);
    assert.equal((await post("/api/action", review, coordinator)).status, 400);
    const results = await Promise.all([first, second].map(cookie => post("/api/action", review, cookie)));
    assert.ok(results.every(response => response.status === 200));
    const changed = { ...review, answers: { ...answers, c1: "NO" }, measure: "Aviso" };
    assert.equal((await post("/api/action", changed, second)).status, 400);
    const db = new DatabaseSync(join(directory, "ria-rutas.sqlite"), { readOnly: true });
    try {
      const records = db.prepare("SELECT user_id, day, vehicle_id, history FROM inspections").all();
      assert.equal(records.length, 1);
      assert.equal(records[0].vehicle_id, "F01");
      assert.equal(JSON.parse(records[0].history).length, 1);
    } finally {
      db.close();
    }
    await stop();
    await start();
    const state = await fetch(origin + "/api/state", { headers: { cookie: coordinator } }).then(response => response.json());
    assert.equal(state.trips.length, 5);
    assert.equal(state.trips[0].inspection.results.length, 18);
    assert.equal(state.trips[0].events.length, 1);
  } finally {
    await stop();
    await rm(directory, { recursive: true });
  }
});
