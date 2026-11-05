import { accounts, hospitalLabel, seed, vehicleLabel } from "./scenarios.mjs";
import { checks } from "./checks.mjs";
import { act, availableOn, labels, view, workshop } from "./routes.mjs";
import { barcode } from "./barcode.mjs";
import { routeScene } from "./map.mjs";

const local = location.hostname === "127.0.0.1";
const key = "ria-rutas-demo-v1";
const app = document.querySelector("#app");
const message = document.querySelector("#message");
const escape = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const time = value => value ? new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Madrid",
}).format(new Date(value)) : "Pendiente";
const name = id => accounts.find(account => account.id === id)?.name ?? "Sin asignar";
const disabled = value => value ? " disabled" : "";
const options = (items, selected) => items.map(item =>
  `<option value="${escape(item.id)}"${item.id === selected ? " selected" : ""}>${escape(item.name)}</option>`).join("");

let actor;
let data;
let active;
let busy = false;
const displayedWorkshop = new Set();
const inspectionDrafts = new Map();
const inspectionKey = trip => JSON.stringify([
  actor.id, trip.day, trip.id, trip.vehicle,
  data.vehicles.find(vehicle => vehicle.id === trip.vehicle)?.stays.length,
]);
function readDemo() {
  try { return JSON.parse(localStorage.getItem(key)) ?? seed(); }
  catch { return seed(); }
}
document.querySelector("#mode").textContent = local
  ? "Aplicación local · SQLite" : "Demo pública · Datos ficticios en este navegador";

function notify(text, error = false) {
  message.textContent = text;
  message.toggleAttribute("data-error", error);
}

async function api(path, body) {
  const response = await fetch(`./api/${path}`, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

async function update() {
  data = local ? await api("state") : view(readDemo(), actor);
}

async function action(payload) {
  if (local) {
    data = await api("action", payload);
  } else {
    const save = () => {
      const next = readDemo();
      act(next, actor, payload);
      localStorage.setItem(key, JSON.stringify(next));
      data = view(next, actor);
    };
    if (navigator.locks) await navigator.locks.request(key, save);
    else save();
  }
}

function signIn() {
  return `<section class="panel login-panel"><h2>Iniciar sesión</h2>
    <form data-form="login"><label>Usuario<input name="account" required autocomplete="username"></label>
    <label>Contraseña<input type="password" name="password" required autocomplete="current-password"></label>
    <button>Entrar</button></form>
    ${local ? "" : `<p><small>Acceso simulado en este navegador.</small></p><details><summary>Credenciales públicas de demostración</summary>
      <p>Contraseña de prueba para todos los perfiles: <code>RutasDemo26</code>.</p>
      <ul>${accounts.map(account => `<li>${escape(account.name)} · <code>${account.id}</code></li>`).join("")}</ul>
    </details>`}</section>`;
}

function review(trip) {
  const inspection = trip.inspection;
  if (!inspection) return "";
  return `<details class="task-card"><summary>Revisión registrada <span class="pill">${inspection.ready ? "Apta para la demo" : "Bloquea la salida"}</span></summary>
    <p>${escape(vehicleLabel({ id: inspection.vehicle, plate: inspection.plate }))} · ${time(inspection.at)}</p>
    <ol class="review-results">${inspection.results.map(item => `<li>${escape(item.text)} <strong>${escape(item.answer)}</strong></li>`).join("")}</ol>
    <p>Medida adoptada: ${escape(inspection.measure || "Sin medidas")}</p></details>`;
}

function metadata(trip) {
  const vehicle = data.vehicles.find(item => item.id === trip.vehicle);
  const facts = [
    ["Chófer", name(trip.driver)], ["Furgoneta", vehicleLabel(vehicle)],
    ["Jornada", trip.day], ["Salida", time(trip.departedAt)], ["Cierre", time(trip.finishedAt)],
  ];
  return `<dl class="meta">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>`;
}

function form(action, content, label, blocked = false) {
  return `<form data-form="${action}">${content}<button${disabled(blocked)}>${label}</button></form>`;
}

const codeField = '<label>Código de caja<input name="box" inputmode="numeric" pattern="[0-9]{4,24}" required></label>';

function stops(trip, interactive) {
  const next = trip.stops.findIndex(stop => !stop.delivered);
  return trip.stops.map((stop, i) => `<section class="stop" id="stop-${i}" tabindex="-1">
    <strong>${i + 1}. ${escape(hospitalLabel(stop.hospital))}</strong>
    <p>Caja ${escape(stop.box)} · ${trip.loaded.includes(stop.box) ? "Carga verificada" : "Por cargar"}</p>
    ${barcode(stop.box)}
    ${stop.delivered ? `<p>Recepción simulada · ${time(stop.delivered.at)}</p>` : ""}
    ${interactive && trip.status === "underway" && i === next ? form("deliver",
      `<input type="hidden" name="stop" value="${i}">${codeField}
       <label><span><input type="checkbox" name="received" required> Confirmo la recepción simulada del hospital</span></label>`, "Registrar entrega") : ""}
    </section>`).join("");
}

function history(trip) {
  return `<ol class="timeline">${trip.events.map(event =>
    `<li><strong>${escape(event.type)}</strong> · ${escape(event.detail)}<br>
    <small>${time(event.at)} · ${escape(event.actor)}</small></li>`).join("")}</ol>`;
}

function workshopHistory(vehicle) {
  if (!vehicle.stays.length) return "<p>Sin estancias registradas.</p>";
  return `<ol class="timeline">${vehicle.stays.map(stay =>
    `<li>Entrada ${escape(stay.entryDate)} · ${escape(stay.reason || "")} · ${escape(stay.entryBy || "")}
    ${stay.entryAt ? ` · ${time(stay.entryAt)}` : ""}
    <br>Regreso ${escape(stay.returnDate || "pendiente")} · ${escape(stay.returnBy || "")}
    ${stay.returnAt ? ` · ${time(stay.returnAt)}` : ""}</li>`).join("")}</ol>`;
}

function workshopPanel(trips) {
  const vehicles = data.vehicles.filter(vehicle => vehicle.stays.length &&
    (actor.role === "coordinator" || trips.some(trip => trip.vehicle === vehicle.id)));
  if (!vehicles.length) return { alert: "", history: "" };
  const key = `ria-workshop-seen-${local ? "local" : "demo"}-${actor.id}`;
  let seen;
  try { seen = new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); }
  catch { seen = new Set(); }
  const fresh = vehicles.filter(vehicle => {
    if (!workshop(vehicle)) return false;
    const stay = vehicle.stays.at(-1);
    const id = `${vehicle.id}:${stay.entryAt ?? stay.entryDate}`;
    if (displayedWorkshop.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    displayedWorkshop.add(id);
    return true;
  });
  try { localStorage.setItem(key, JSON.stringify([...seen])); }
  catch { /* The history is still available when browser storage is disabled. */ }
  return {
    alert: fresh.length ? `<div class="notice warning" role="alert"><strong>Nueva entrada en taller</strong>
      <p>${fresh.map(vehicle => escape(vehicleLabel(vehicle))).join(" · ")}</p>
      <button type="button" class="secondary" data-dismiss-workshop>Entendido</button></div>` : "",
    history: `<section class="panel"><h2>Historial de taller</h2>${vehicles.map(vehicle =>
      `<details><summary>${escape(vehicleLabel(vehicle))} · ${workshop(vehicle) ? "En taller" : "Disponible"}</summary>
      ${workshopHistory(vehicle)}</details>`).join("")}</section>`,
  };
}

function prepare(trip) {
  const vehicle = data.vehicles.find(item => item.id === trip.vehicle);
  const inWorkshop = vehicle && workshop(vehicle);
  const vans = data.vehicles.filter(item => availableOn(item, trip.day)).map(item => ({ id: item.id, name: vehicleLabel(item) }));
  const select = form("vehicle", `<label>Furgoneta<select name="vehicle" required>
    <option value="">Selecciona una furgoneta</option>${options(vans, trip.vehicle)}</select></label>`, "Asignar vehículo");
  if (!vehicle) return select;
  const date = `<label>Fecha efectiva<input type="date" name="date" value="${escape(trip.day)}" required></label>`;
  const maintenance = inWorkshop ? `<p class="notice warning">La furgoneta está en taller.</p>${form("workshop-out", date, "Registrar regreso")}`
    : `<details class="task-card"><summary>Registrar entrada en taller <span class="pill">Si procede</span></summary>${form("workshop-in",
        `${date}<label>Motivo<input name="reason" maxlength="300" required></label>`, "Registrar entrada")}</details>`;
  const draft = inspectionDrafts.get(inspectionKey(trip));
  const inspection = `<details class="task-card"${draft ? " open" : ""}><summary>Completar revisión de 18 controles <span class="pill pending">Pendiente</span></summary>${form("inspection",
    `<div class="checklist">${checks.map(check => `<label class="control-card">${escape(check.text)}
      <select name="${check.id}" required><option value="">Pendiente</option>
      ${options((check.blocking ? ["OK", "NO"] : ["OK", "NO", "NA"]).map(id => ({ id, name: id })), draft?.[check.id])}</select></label>`).join("")}</div>
      <label>Medida adoptada (obligatoria si hay algún NO)<textarea name="measure" maxlength="300" aria-describedby="inspection-error">${escape(draft?.measure)}</textarea></label>
      <p id="inspection-error" class="notice warning" role="alert" hidden></p>`, "Guardar revisión")}</details>`;
  const missing = trip.stops.length - trip.loaded.length;
  const hint = [!trip.inspection?.ready ? "Falta una revisión apta." : "",
    missing ? `Cajas por verificar: ${missing}.` : ""].filter(Boolean).join(" ");
  const operations = availableOn(vehicle, trip.day)
    ? `${trip.inspection?.ready ? "" : inspection}${form("load", codeField, "Verificar carga")}
      ${hint ? `<p class="notice">${hint}</p>` : ""}${form("depart", "", "Confirmar salida", Boolean(hint))}`
    : inWorkshop ? "" : '<p class="notice warning">El regreso es posterior a la jornada de este viaje.</p>';
  return `${select}${maintenance}${operations}`;
}

function plan() {
  return `<details class="panel"><summary>Asignar un viaje nuevo</summary>
    ${form("plan", `<label>Título<input name="title" maxlength="100" required></label>
      <label>Chófer<select name="driver">${options(accounts.filter(item => item.role === "driver"))}</select></label>
      <label>Jornada<input type="date" name="day" required></label>
      <label>Paradas en orden, una por línea: hospital | código de caja
      <textarea name="stops" rows="3" required placeholder="Hospital Civil | 9001"></textarea></label>`, "Asignar viaje")}
    </details>`;
}

function render() {
  if (!actor) { app.innerHTML = signIn(); return; }
  const coordinator = actor.role === "coordinator";
  const maintenance = workshopPanel(data.trips);
  const trip = data.trips.find(item => item.id === active) ?? data.trips[0];
  active = trip?.id;
  const tripList = data.trips.map(item => `<button class="secondary trip-link" data-trip="${escape(item.id)}"
    aria-current="${item.id === active}">${escape(item.id)} · ${escape(labels[item.status])}<span>${escape(item.title)}</span></button>`).join("");
  const summary = trip ? `<article class="panel">
    <span class="pill">${escape(labels[trip.status])}</span><h2>${escape(trip.id)} · ${escape(trip.title)}</h2>
    ${metadata(trip)}
    ${routeScene(trip.stops.map(stop => ({ ...stop, hospital: hospitalLabel(stop.hospital) })), escape)}
    ${review(trip)}
    ${coordinator && !trip.inspection ? '<p class="task-card">Revisión del vehículo <span class="pill pending">Pendiente</span></p>' : ""}
    ${!coordinator && trip.status === "assigned" ? prepare(trip) : ""}
    <h3>Paradas y cajas</h3>${stops(trip, !coordinator)}
    ${!coordinator && trip.status === "underway" ? form("finish", "", "Finalizar viaje", !trip.stops.every(stop => stop.delivered)) : ""}
    <h3>Cronología</h3>${trip.events.length ? history(trip) : "<p>Todavía no hay operaciones registradas.</p>"}
    ${coordinator && trip.departedAt ? '<div class="actions"><button data-download="html">Comprobante HTML</button><button class="secondary" data-download="csv">Comprobante CSV</button></div>' : ""}
  </article>` : '<p class="panel">No tienes viajes asignados.</p>';
  app.innerHTML = `<div class="toolbar"><strong>${escape(actor.name)}</strong><div class="actions">
    ${local ? "" : '<button class="secondary" data-reset>Restablecer demo</button>'}
    <button class="secondary" data-refresh>Actualizar</button>
    <button class="secondary" data-logout>Cerrar sesión</button>
    </div></div>
    ${maintenance.alert}
    ${coordinator ? plan() : ""}
    <div class="layout"><nav class="trip-list" aria-label="Viajes">${tripList}</nav>${summary}</div>
    ${maintenance.history}`;
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function download(format) {
  const trip = data.trips.find(item => item.id === active);
  if (format === "csv") {
    const quote = value => {
      const text = String(value ?? "");
      return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
    };
    const rows = [["Viaje", "Jornada", "Chófer", "Vehículo", "Salida", "Cierre", "Hospital", "Caja", "Recepción", "Hora de entrega"],
      ...trip.stops.map(stop => [trip.id, trip.day, name(trip.driver), vehicleLabel(data.vehicles.find(vehicle => vehicle.id === trip.vehicle)), time(trip.departedAt),
        time(trip.finishedAt), hospitalLabel(stop.hospital), stop.box, stop.delivered?.receipt, time(stop.delivered?.at)])];
    downloadFile(`${trip.id}.csv`, "\uFEFF" + rows.map(row => row.map(quote).join(";")).join("\r\n"), "text/csv;charset=utf-8");
    return;
  }
  const logo = await fetch("./logo.svg").then(response => {
    if (!response.ok) throw new Error("No se pudo cargar el logo del comprobante.");
    return response.text();
  });
  const css = await fetch("./report.css").then(response => {
    if (!response.ok) throw new Error("No se pudo cargar el diseño del comprobante.");
    return response.text();
  });
  const body = `<header class="top"><img width="225" alt="Ría de Rutas" src="data:image/svg+xml,${escape(encodeURIComponent(logo))}"></header>
    <main><section class="report-title"><p>DOCUMENTO DE DEMOSTRACIÓN · ${escape(labels[trip.status])}</p>
    <h1>Comprobante de transporte</h1><p>${escape(trip.id)} · ${escape(trip.title)}</p></section>
    ${metadata(trip)}
    <h2>Paradas y verificación de carga</h2>
    <p>${trip.loaded.length} de ${trip.stops.length} cajas verificadas · Recepción simulada</p>
    <div class="report-stops">${stops(trip, false)}</div>
    ${review(trip).replace("<details ", "<details open ")}
    <h2>Cronología</h2>${history(trip)}</main>`;
  downloadFile(`${trip.id}.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Comprobante ${escape(trip.id)}</title><style>${css}</style>${body}</html>`, "text/html;charset=utf-8");
}

async function handle(operation, showError = error => notify(error.message, true)) {
  if (busy) return;
  busy = true;
  notify("");
  try { await operation(); render(); }
  catch (error) { showError(error); }
  finally { busy = false; }
}

function rememberInspection(form) {
  const trip = data.trips.find(item => item.id === active);
  const key = inspectionKey(trip);
  inspectionDrafts.set(key, Object.fromEntries(new FormData(form)));
  return key;
}

app.addEventListener("input", event => {
  const form = event.target.form;
  if (form?.dataset.form === "inspection") rememberInspection(form);
});

app.addEventListener("submit", event => {
  event.preventDefault();
  const errorBox = event.target.querySelector("#inspection-error");
  const measure = errorBox && event.target.elements.measure;
  let missingMeasure = false;
  if (errorBox) errorBox.hidden = true;
  measure?.removeAttribute?.("aria-invalid");
  handle(async () => {
    const fields = Object.fromEntries(new FormData(event.target));
    const kind = event.target.dataset.form;
    if (kind === "login") {
      if (local) actor = (await api("login", fields)).actor;
      else {
        const account = accounts.find(item => item.id === fields.account.trim().toLowerCase());
        if (!account || fields.password !== "RutasDemo26") throw new Error("Usuario o contraseña incorrectos.");
        actor = account;
      }
      await update();
      return;
    }
    const payload = { ...fields, action: kind, trip: active };
    const draftKey = kind === "inspection" ? rememberInspection(event.target) : null;
    if (draftKey) {
      payload.answers = Object.fromEntries(checks.map(item => [item.id, fields[item.id]]));
      if (Object.values(payload.answers).includes("NO") && !fields.measure.trim()) {
        missingMeasure = true;
        throw new Error("Escribe la medida adoptada antes de guardar una revisión con algún NO.");
      }
    }
    if (kind === "deliver") {
      payload.stop = Number(fields.stop);
      payload.received = fields.received === "on";
    }
    if (kind === "plan") payload.stops = fields.stops.split(/\r?\n/).filter(line => line.trim()).map(line => {
      const [hospital, box] = line.split("|");
      return { hospital, box };
    });
    await action(payload);
    if (draftKey) inspectionDrafts.delete(draftKey);
    notify("Operación registrada.");
  }, errorBox ? error => {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    if (missingMeasure) {
      measure.setAttribute("aria-invalid", "true");
      measure.focus();
    }
  } : undefined);
});

app.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const { dataset } = button;
  if (dataset.stop !== undefined) {
    const stop = document.getElementById(`stop-${dataset.stop}`);
    stop?.focus();
    stop?.scrollIntoView({ block: "center" });
  }
  if (dataset.trip) handle(async () => { active = dataset.trip; });
  if ("dismissWorkshop" in dataset) handle(async () => { displayedWorkshop.clear(); });
  if ("logout" in dataset) handle(async () => {
    if (local) await api("logout", {});
    displayedWorkshop.clear();
    inspectionDrafts.clear();
    actor = null;
    active = null;
  });
  if ("refresh" in dataset) handle(update);
  if (dataset.download) download(dataset.download).catch(error => notify(error.message, true));
  if ("reset" in dataset && confirm("¿Restablecer los cinco viajes de la demo en este navegador?")) {
    handle(async () => { localStorage.removeItem(key); inspectionDrafts.clear(); await update(); });
  }
});

handle(async () => {
  if (local) {
    actor = (await api("session")).actor;
    if (actor) await update();
  }
});
