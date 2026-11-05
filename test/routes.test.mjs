import test from "node:test";
import assert from "node:assert/strict";
import { accounts, seed } from "../public/scenarios.mjs";
import { checks } from "../public/checks.mjs";
import { act, view } from "../public/routes.mjs";

const good = Object.fromEntries(checks.map(check => [check.id, "OK"]));
const drivers = accounts.filter(item => item.role === "driver");
const now = "2026-11-05T08:00:00.000Z";

function operate(state, driver, trip, action, fields = {}) {
  act(state, drivers[driver - 1], { trip, action, ...fields }, now);
}

test("el conductor solo ve y modifica viajes propios", () => {
  const state = seed();
  assert.deepEqual(view(state, drivers[3]).trips.map(trip => trip.id), ["V04", "V05"]);
  assert.equal(view(state, accounts[4]).trips.length, 5);
  assert.throws(() => operate(state, 1, "V02", "depart"), /no disponible/);
});

test("una salida y un cierre repetidos conservan sus horas", () => {
  const state = seed();
  const trip = state.trips[0];
  const run = (action, fields) => operate(state, 1, trip.id, action, fields);
  run("inspection", { answers: good });
  run("load", { box: trip.stops[0].box });
  run("depart");
  run("depart");
  assert.equal(trip.departedAt, now);
  assert.throws(() => run("finish"), /Faltan entregas/);
  run("deliver", { stop: 0, box: trip.stops[0].box, received: true });
  run("finish");
  run("finish");
  assert.equal(trip.finishedAt, now);
  assert.equal(trip.events.filter(event => event.type === "Viaje finalizado").length, 1);
});

test("una caja pendiente o ajena impide confirmar la salida", () => {
  const state = seed();
  const trip = state.trips[1];
  const run = (action, fields) => operate(state, 2, trip.id, action, fields);
  run("inspection", { answers: good });
  assert.throws(() => run("load", { box: "9999" }), /no pertenece/);
  run("load", { box: trip.stops[0].box });
  assert.throws(() => run("depart"), /Faltan cajas/);
  run("load", { box: trip.stops[1].box });
  run("depart");
  assert.equal(trip.status, "underway");
});

test("cada hospital recibe su propia caja en el orden asignado", () => {
  const state = seed();
  const trip = state.trips[2];
  const run = (action, fields) => operate(state, 3, trip.id, action, fields);
  run("inspection", { answers: good });
  for (const stop of trip.stops) run("load", { box: stop.box });
  run("depart");
  assert.throws(() => run("deliver", { stop: 0, box: trip.stops[1].box, received: true }), /no corresponde/);
  assert.throws(() => run("deliver", { stop: 1, box: trip.stops[1].box, received: true }), /orden asignado/);
  assert.ok(trip.stops.every(stop => !stop.delivered));
  run("deliver", { stop: 0, box: trip.stops[0].box, received: true });
  assert.throws(() => run("finish"), /Faltan entregas/);
});

test("una furgoneta en taller continúa bloqueada en la jornada siguiente", () => {
  const state = seed();
  const [fourth, fifth] = state.trips.slice(3);
  const run = (trip, action, fields) => operate(state, 4, trip.id, action, fields);
  run(fourth, "inspection", { answers: good });
  run(fourth, "workshop-in", { date: fourth.day, reason: "Fallo de luces" });
  run(fourth, "vehicle", { vehicle: "F05" });
  assert.throws(() => run(fourth, "depart"), /revisión válida/);
  assert.throws(() => run(fifth, "depart"), /no disponible/);
  assert.throws(() => run(fifth, "workshop-out", { date: "2026-11-04" }), /anterior/);
  assert.throws(() => run(fifth, "workshop-out", { date: "2026-11-07" }), /posterior/);
  run(fifth, "workshop-out", { date: fifth.day });
  assert.throws(() => run(fifth, "depart"), /revisión válida/);
  run(fifth, "inspection", { answers: good });
  run(fifth, "load", { box: fifth.stops[0].box });
  run(fifth, "depart");
  assert.equal(fifth.status, "underway");
  assert.equal(state.vehicles[3].stays[0].returnBy, "Chófer 04");
});

test("un regreso el mismo día exige revisión nueva y conserva la anterior", () => {
  const state = seed();
  const trip = state.trips[0];
  const run = (action, fields) => operate(state, 1, trip.id, action, fields);
  run("inspection", { answers: good });
  run("workshop-in", { date: trip.day, reason: "Diagnóstico" });
  run("workshop-out", { date: trip.day });
  assert.throws(() => run("depart"), /revisión válida/);
  run("inspection", { answers: good });
  assert.equal(state.inspections.length, 2);
  assert.equal(state.inspections[1].cycle, 1);
});

test("un NO bloqueante queda registrado sin autorizar la salida", () => {
  const state = seed();
  const trip = state.trips[0];
  const run = (action, fields) => operate(state, 1, trip.id, action, fields);
  assert.throws(() => run("inspection", { answers: { ...good, c1: "NA" } }), /inválida/);
  run("inspection", { answers: { ...good, c1: "NO" }, measure: "Avisado al responsable" });
  run("load", { box: trip.stops[0].box });
  assert.throws(() => run("depart"), /revisión válida/);
  assert.equal(state.inspections[0].ready, false);
});
