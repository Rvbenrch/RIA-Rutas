import { accounts, seed } from "./scenarios.mjs";
import { checks } from "./checks.mjs";
import { act, availableOn, labels, view, workshop } from "./routes.mjs";
import { barcode } from "./barcode.mjs";

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
  const select = `<label>Perfil<select name="account">${options(accounts)}</select></label>`;
  return `<section class="panel"><h2>${local ? "Acceso local" : "Elige un perfil de la demo"}</h2>
    <form data-form="login">${select}
    ${local ? '<label>Contraseña<input type="password" name="password" required autocomplete="current-password"></label>' : ""}
    <button>${local ? "Entrar" : "Abrir perfil"}</button></form></section>`;
}

function review(trip) {
  const inspection = trip.inspection;
  if (!inspection) return "<p>Revisión pendiente.</p>";
  return `<details><summary>Revisión · ${inspection.ready ? "Apta para la demo" : "Bloquea la salida"}</summary>
    <p>${escape(inspection.plate)} · ${time(inspection.at)}</p>
    <ol>${inspection.results.map(item => `<li>${escape(item.text)} <strong>${escape(item.answer)}</strong></li>`).join("")}</ol>
    <p>Medida adoptada: ${escape(inspection.measure || "Sin medidas")}</p></details>`;
}

function metadata(trip) {
  const vehicle = data.vehicles.find(item => item.id === trip.vehicle);
  const facts = [
    ["Chófer", name(trip.driver)], ["Furgoneta", vehicle?.plate ?? "Sin asignar"],
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
  return trip.stops.map((stop, i) => `<section class="stop">
    <strong>${i + 1}. ${escape(stop.hospital)}</strong>
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

function prepare(trip) {
  const vehicle = data.vehicles.find(item => item.id === trip.vehicle);
  const inWorkshop = vehicle && workshop(vehicle);
  const vans = data.vehicles.filter(item => availableOn(item, trip.day)).map(item => ({ id: item.id, name: item.plate }));
  const select = form("vehicle", `<label>Furgoneta<select name="vehicle" required>
    <option value="">Selecciona una furgoneta</option>${options(vans, trip.vehicle)}</select></label>`, "Asignar vehículo");
  if (!vehicle) return select;
  const date = `<label>Fecha efectiva<input type="date" name="date" value="${escape(trip.day)}" required></label>`;
  const maintenance = inWorkshop ? `<p class="notice warning">La furgoneta está en taller.</p>${form("workshop-out", date, "Registrar regreso")}`
    : `<details><summary>Registrar entrada en taller</summary>${form("workshop-in",
        `${date}<label>Motivo<input name="reason" maxlength="300" required></label>`, "Registrar entrada")}</details>`;
  const inspection = `<details><summary>Completar revisión de 18 controles</summary>${form("inspection",
    `<div class="checklist">${checks.map(check => `<label>${escape(check.text)}
      <select name="${check.id}" required><option value="">Selecciona</option><option>OK</option><option>NO</option>
      ${check.blocking ? "" : "<option>NA</option>"}</select></label>`).join("")}</div>
      <label>Medida adoptada si hay algún NO<textarea name="measure" maxlength="300"></textarea></label>`, "Guardar revisión")}</details>`;
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
      <textarea name="stops" rows="3" required placeholder="Hospital Demo Ría | 9001"></textarea></label>`, "Asignar viaje")}
    </details>`;
}

function render() {
  if (!actor) { app.innerHTML = signIn(); return; }
  const coordinator = actor.role === "coordinator";
  const trip = data.trips.find(item => item.id === active) ?? data.trips[0];
  active = trip?.id;
  const tripList = data.trips.map(item => `<button class="secondary trip-link" data-trip="${escape(item.id)}"
    aria-current="${item.id === active}">${escape(item.id)} · ${escape(labels[item.status])}<span>${escape(item.title)}</span></button>`).join("");
  const summary = trip ? `<article class="panel">
    <span class="pill">${escape(labels[trip.status])}</span><h2>${escape(trip.id)} · ${escape(trip.title)}</h2>
    ${metadata(trip)}
    ${review(trip)}
    ${!coordinator && trip.status === "assigned" ? prepare(trip) : ""}
    <h3>Paradas y cajas</h3>${stops(trip, !coordinator)}
    ${!coordinator && trip.status === "underway" ? form("finish", "", "Finalizar viaje", !trip.stops.every(stop => stop.delivered)) : ""}
    <h3>Cronología</h3>${trip.events.length ? history(trip) : "<p>Todavía no hay operaciones registradas.</p>"}
    ${coordinator && trip.departedAt ? '<div class="actions"><button data-download="html">Comprobante HTML</button><button class="secondary" data-download="csv">Comprobante CSV</button></div>' : ""}
  </article>` : '<p class="panel">No tienes viajes asignados.</p>';
  app.innerHTML = `<div class="toolbar"><strong>${escape(actor.name)}</strong><div class="actions">
    ${local ? "" : '<button class="secondary" data-reset>Restablecer demo</button>'}
    <button class="secondary" data-refresh>Actualizar</button>
    <button class="secondary" data-logout>${local ? "Cerrar sesión" : "Cambiar perfil"}</button>
    </div></div>
    ${coordinator ? plan() : ""}
    <div class="layout"><nav class="trip-list" aria-label="Viajes">${tripList}</nav>${summary}</div>
    ${coordinator ? `<section class="panel"><h2>Historial de taller</h2>${data.vehicles.map(vehicle =>
      `<details><summary>${escape(vehicle.plate)} · ${workshop(vehicle) ? "En taller" : "Disponible"}</summary>
      ${workshopHistory(vehicle)}</details>`).join("")}</section>` : ""}`;
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
      ...trip.stops.map(stop => [trip.id, trip.day, name(trip.driver), trip.departureInspection.plate, time(trip.departedAt),
        time(trip.finishedAt), stop.hospital, stop.box, stop.delivered?.receipt, time(stop.delivered?.at)])];
    downloadFile(`${trip.id}.csv`, "\uFEFF" + rows.map(row => row.map(quote).join(";")).join("\r\n"), "text/csv;charset=utf-8");
    return;
  }
  const logo = await fetch("./logo.svg").then(response => response.text());
  const css = await fetch("./style.css").then(response => response.text());
  const body = `<header class="top"><img width="225" alt="Ría de Rutas" src="data:image/svg+xml,${escape(encodeURIComponent(logo))}"></header>
    <main class="panel"><h1>Comprobante de viaje ${escape(trip.id)}</h1>${metadata(trip)}
    <p>Cajas verificadas: ${trip.loaded.length}. Recepción simulada.</p>${stops(trip, false)}${review(trip)}
    <h2>Cronología</h2>${history(trip)}</main>`;
  downloadFile(`${trip.id}.html`, `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Comprobante ${escape(trip.id)}</title><style>${css}</style>${body}</html>`, "text/html;charset=utf-8");
}

async function handle(operation) {
  if (busy) return;
  busy = true;
  notify("");
  try { await operation(); render(); }
  catch (error) { notify(error.message, true); }
  finally { busy = false; }
}

app.addEventListener("submit", event => {
  event.preventDefault();
  handle(async () => {
    const fields = Object.fromEntries(new FormData(event.target));
    const kind = event.target.dataset.form;
    if (kind === "login") {
      actor = local ? (await api("login", fields)).actor : accounts.find(item => item.id === fields.account);
      await update();
      return;
    }
    const payload = { ...fields, action: kind, trip: active };
    if (kind === "inspection") payload.answers = Object.fromEntries(checks.map(item => [item.id, fields[item.id]]));
    if (kind === "deliver") {
      payload.stop = Number(fields.stop);
      payload.received = fields.received === "on";
    }
    if (kind === "plan") payload.stops = fields.stops.split(/\r?\n/).filter(line => line.trim()).map(line => {
      const [hospital, box] = line.split("|");
      return { hospital, box };
    });
    await action(payload);
    notify("Operación registrada.");
  });
});

app.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const { dataset } = button;
  if (dataset.trip) handle(async () => { active = dataset.trip; });
  if ("logout" in dataset) handle(async () => { if (local) await api("logout", {}); actor = null; active = null; });
  if ("refresh" in dataset) handle(update);
  if (dataset.download) download(dataset.download).catch(error => notify(error.message, true));
  if ("reset" in dataset && confirm("¿Restablecer los cinco viajes de la demo en este navegador?")) {
    handle(async () => { localStorage.removeItem(key); await update(); });
  }
});

handle(async () => {
  if (local) {
    actor = (await api("session")).actor;
    if (actor) await update();
  }
});
