import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { accounts, seed } from "./public/scenarios.mjs";
import { act, view } from "./public/routes.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = resolve(root, "public");
const database = resolve(process.env.RIA_DATA_DIR || resolve(root, "runtime"), "ria-rutas.sqlite");
const port = Number(process.env.PORT || 8782);
const origin = `http://127.0.0.1:${port}`;
const lifetime = 8 * 60 * 60 * 1000;

mkdirSync(dirname(database), { recursive: true });
const db = new DatabaseSync(database, { timeout: 5000 });
db.exec(`
  CREATE TABLE IF NOT EXISTS fleet (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS login_counter (id INTEGER PRIMARY KEY CHECK (id = 1), total INTEGER NOT NULL);
  INSERT OR IGNORE INTO login_counter VALUES (1, 100);
  CREATE TABLE IF NOT EXISTS inspections (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    history TEXT NOT NULL,
    UNIQUE (user_id, day, vehicle_id)
  );
`);
db.prepare("INSERT OR IGNORE INTO fleet VALUES (1, ?)").run(JSON.stringify(seed()));

function fleet() {
  return JSON.parse(db.prepare("SELECT state FROM fleet WHERE id = 1").get().state);
}

function state() {
  const reviews = db.prepare("SELECT history FROM inspections").all()
    .flatMap(row => JSON.parse(row.history))
    .sort((a, b) => a.sequence - b.sequence);
  return { ...fleet(), inspections: reviews };
}

function persistInspection(inspection, sequence) {
  db.prepare(`
    INSERT INTO inspections (user_id, day, vehicle_id, history)
    VALUES (?, ?, ?, json_array(json(?)))
    ON CONFLICT (user_id, day, vehicle_id)
    DO UPDATE SET history = json_insert(inspections.history, '$[#]', json(?))
  `).run(inspection.driver, inspection.day, inspection.vehicle,
    JSON.stringify({ ...inspection, sequence }), JSON.stringify({ ...inspection, sequence }));
}

function persistFleet({ inspections, ...data }) {
  db.prepare("UPDATE fleet SET state = ? WHERE id = 1").run(JSON.stringify(data));
}

function transaction(operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    operation();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

transaction(() => {
  const stored = fleet();
  if (!Array.isArray(stored.inspections)) return;
  stored.inspections.forEach(persistInspection);
  persistFleet(stored);
});

if (!db.prepare("SELECT 1 FROM credentials LIMIT 1").get()) {
  const credentials = accounts.map(account => ({
    id: account.id, password: randomBytes(18).toString("base64url"), salt: randomBytes(16).toString("hex"),
  }));
  transaction(() => {
    const insert = db.prepare("INSERT INTO credentials VALUES (?, ?, ?)");
    for (const entry of credentials) {
      insert.run(entry.id, entry.salt, scryptSync(entry.password, entry.salt, 64).toString("hex"));
    }
    writeFileSync(resolve(dirname(database), "accesos-locales.txt"),
      credentials.map(entry => `${entry.id}\t${entry.password}`).join("\n") + "\n", { mode: 0o600 });
  });
  console.log("Accesos generados en runtime/accesos-locales.txt.");
}

const mime = { ".html": "text/html", ".css": "text/css", ".mjs": "text/javascript", ".svg": "image/svg+xml" };
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'",
};

function json(response, status, payload, extra = {}) {
  response.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  response.end(JSON.stringify(payload));
}

function session(request) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)ria_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const found = token && db.prepare("SELECT account FROM sessions WHERE token = ? AND expires > ?").get(token, Date.now());
  return { token, actor: accounts.find(account => account.id === found?.account) };
}

async function readJson(request) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw new Error("Se esperaba JSON.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new Error("Solicitud demasiado grande.");
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Datos inválidos.");
  return data;
}

const attempts = new Map();

async function api(request, response, path) {
  const current = session(request);
  if (path === "/api/session" && request.method === "GET") {
    return json(response, 200, { actor: current.actor ?? null });
  }
  if (request.method === "POST" && request.headers.origin !== origin) {
    return json(response, 403, { error: "Origen no permitido." });
  }
  if (path === "/api/login" && request.method === "POST") {
    const ip = request.socket.remoteAddress;
    const previous = attempts.get(ip);
    const attempt = previous?.until > Date.now() ? previous : { count: 0, until: Date.now() + 60000 };
    if (attempt.count >= 8) return json(response, 429, { error: "Espera un minuto antes de intentarlo de nuevo." });
    attempt.count += 1;
    attempts.set(ip, attempt);
    const { account, password } = await readJson(request);
    const row = typeof account === "string" && db.prepare("SELECT salt, hash FROM credentials WHERE id = ?").get(account);
    const candidate = typeof password === "string" && password.length <= 128 ? password : "";
    const hash = scryptSync(candidate, row?.salt ?? "0".repeat(32), 64);
    if (!row || !timingSafeEqual(hash, Buffer.from(row.hash, "hex"))) {
      return json(response, 401, { error: "Cuenta o contraseña incorrectas." });
    }
    attempts.delete(ip);
    const token = randomBytes(32).toString("hex");
    transaction(() => {
      db.prepare("DELETE FROM sessions WHERE expires <= ? OR token = ?").run(Date.now(), current.token ?? "");
      db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(token, account, Date.now() + lifetime);
      db.exec("UPDATE login_counter SET total = total + 1 WHERE id = 1");
    });
    return json(response, 200, { actor: accounts.find(item => item.id === account) }, {
      "Set-Cookie": `ria_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${lifetime / 1000}`,
    });
  }
  if (!current.actor) return json(response, 401, { error: "Inicia sesión." });
  if (path === "/api/logout" && request.method === "POST") {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(current.token);
    return json(response, 200, {}, { "Set-Cookie": "ria_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }
  if (path === "/api/state" && request.method === "GET") {
    return json(response, 200, view(state(), current.actor));
  }
  if (path === "/api/action" && request.method === "POST") {
    const payload = await readJson(request);
    transaction(() => {
      const data = state();
      const before = data.inspections.length;
      act(data, current.actor, payload);
      for (let index = before; index < data.inspections.length; index++) {
        persistInspection(data.inspections[index], index);
      }
      persistFleet(data);
    });
    return json(response, 200, view(state(), current.actor));
  }
  return json(response, 404, { error: "Ruta no encontrada." });
}

createServer(async (request, response) => {
  try {
    if (request.headers.host !== `127.0.0.1:${port}`) return json(response, 403, { error: "Host no permitido." });
    const path = new URL(request.url, origin).pathname;
    if (path.startsWith("/api/")) return await api(request, response, path);
    if (request.method !== "GET") return json(response, 405, { error: "Método no permitido." });
    const file = resolve(publicDir, path === "/" ? "index.html" : `.${decodeURIComponent(path)}`);
    const type = mime[extname(file)];
    if (!file.startsWith(publicDir + sep) || !type) return json(response, 404, { error: "Archivo no encontrado." });
    let contents;
    try { contents = readFileSync(file); }
    catch { return json(response, 404, { error: "Archivo no encontrado." }); }
    response.writeHead(200, { ...headers, "Content-Type": `${type}; charset=utf-8` });
    response.end(contents);
  } catch (error) {
    json(response, 400, { error: error instanceof SyntaxError ? "JSON inválido." : error.message });
  }
}).listen(port, "127.0.0.1", () => console.log(`Ría de Rutas: ${origin}`));
