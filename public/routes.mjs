import { accounts, hospitalLabel, vehicleLabel } from "./scenarios.mjs";
import { inspect } from "./checks.mjs";

export const labels = { assigned: "Asignado", underway: "En ruta", finished: "Finalizado" };
export const workshop = vehicle => vehicle.stays.at(-1)?.returnDate === null;
export const availableOn = (vehicle, day) =>
  Boolean(vehicle && !workshop(vehicle) && (!vehicle.stays.length || vehicle.stays.at(-1).returnDate <= day));

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function inspectionFor(state, trip) {
  const vehicle = state.vehicles.find(item => item.id === trip.vehicle);
  const cycle = vehicle?.stays.length ?? 0;
  return state.inspections.findLast(item =>
    item.driver === trip.driver && item.day === trip.day &&
    item.vehicle === trip.vehicle && item.cycle === cycle
  );
}

function sameInspection(first, second) {
  return first.measure === second.measure &&
    first.results.every((item, i) => item.answer === second.results[i].answer);
}

export function view(state, actor) {
  const trips = actor.role === "coordinator" ? state.trips : state.trips.filter(trip => trip.driver === actor.id);
  const vehicles = state.vehicles.map(vehicle => actor.role === "coordinator" ? vehicle : {
    id: vehicle.id, plate: vehicle.plate,
    stays: vehicle.stays.map(stay => ({ entryDate: stay.entryDate, entryAt: stay.entryAt, returnDate: stay.returnDate })),
  });
  return {
    trips: trips.map(trip => ({
      ...trip, inspection: trip.departureInspection ?? inspectionFor(state, trip) ?? null,
    })),
    vehicles,
    inspections: actor.role === "coordinator" ? state.inspections : [],
  };
}

function planTrip(state, payload) {
  require(accounts.some(account => account.id === payload.driver && account.role === "driver"), "Selecciona un chófer.");
  require(validDate(payload.day), "Introduce una jornada válida.");
  const title = clean(payload.title, 100);
  require(title, "Introduce un título.");
  require(Array.isArray(payload.stops) && payload.stops.length >= 1 && payload.stops.length <= 10, "Indica entre una y diez paradas.");
  const stops = payload.stops.map(stop => ({
    hospital: clean(stop?.hospital, 100), box: clean(stop?.box, 24), delivered: null,
  }));
  require(stops.every(stop => stop.hospital && /^\d{4,24}$/.test(stop.box)), "Cada parada necesita hospital y un código numérico de 4 a 24 cifras.");
  require(new Set(stops.map(stop => stop.box)).size === stops.length, "Los códigos de caja deben ser distintos.");
  require(!state.trips.some(trip => trip.status !== "finished" &&
    trip.stops.some(stop => stops.some(other => other.box === stop.box))), "Hay una caja asignada a otro viaje abierto.");
  const id = `V${String(state.trips.length + 1).padStart(2, "0")}`;
  state.trips.push({ id, title, day: payload.day, driver: payload.driver, vehicle: null,
    status: "assigned", stops, loaded: [], events: [] });
}

export function act(state, actor, payload, now = new Date().toISOString()) {
  require(payload && typeof payload === "object", "Acción inválida.");
  if (payload.action === "plan") {
    require(actor.role === "coordinator", "Acción reservada a Coordinación.");
    planTrip(state, payload);
    return;
  }

  const trip = state.trips.find(item => item.id === payload.trip);
  require(trip && actor.role === "driver" && trip.driver === actor.id, "Viaje no disponible para este usuario.");
  const vehicle = state.vehicles.find(item => item.id === trip.vehicle);
  const event = (type, detail) => trip.events.push({ type, detail, at: now, actor: actor.name });
  const assigned = () => require(trip.status === "assigned", "Esta acción se realiza antes de salir.");
  const inUse = van => state.trips.some(other => other !== trip && other.vehicle === van.id && other.status === "underway");

  switch (payload.action) {
    case "vehicle": {
      assigned();
      const next = state.vehicles.find(item => item.id === payload.vehicle);
      require(availableOn(next, trip.day) && !inUse(next), "Furgoneta no disponible.");
      if (trip.vehicle === next.id) return;
      trip.vehicle = next.id;
      trip.loaded = [];
      event("Vehículo asignado", vehicleLabel(next));
      return;
    }
    case "inspection": {
      assigned();
      require(availableOn(vehicle, trip.day) && !inUse(vehicle), "Furgoneta no disponible.");
      const review = inspect(payload.answers, clean(payload.measure, 300));
      const previous = inspectionFor(state, trip);
      if (previous && sameInspection(previous, review)) return;
      require(!previous?.ready, "La revisión válida de esta furgoneta y jornada ya está guardada.");
      state.inspections.push({ ...review, driver: actor.id, day: trip.day, vehicle: vehicle.id,
        plate: vehicle.plate, cycle: vehicle.stays.length, at: now });
      event("Revisión guardada", review.ready ? "Apta para la demo" : "Salida bloqueada");
      return;
    }
    case "workshop-in":
    case "workshop-out": {
      assigned();
      require(vehicle && !inUse(vehicle), "Furgoneta no disponible para registrar taller.");
      require(validDate(payload.date), "Introduce una fecha efectiva válida.");
      require(payload.date <= trip.day, "La fecha efectiva no puede ser posterior a la jornada del viaje.");
      const stay = vehicle.stays.at(-1);
      if (payload.action === "workshop-in") {
        const reason = clean(payload.reason, 300);
        require(!workshop(vehicle), "La furgoneta ya está en taller.");
        require(reason, "Indica el motivo de entrada.");
        require(!stay || payload.date >= stay.returnDate, "La fecha es anterior al último regreso.");
        vehicle.stays.push({ entryDate: payload.date, returnDate: null, reason,
          entryBy: actor.name, entryAt: now });
        for (const pending of state.trips) {
          if (pending.vehicle === vehicle.id && pending.status === "assigned") pending.loaded = [];
        }
        event("Entrada en taller", `${vehicleLabel(vehicle)} · ${payload.date} · ${reason}`);
      } else {
        require(workshop(vehicle), "No hay una estancia abierta.");
        require(payload.date >= stay.entryDate, "El regreso no puede ser anterior a la entrada.");
        Object.assign(stay, { returnDate: payload.date, returnBy: actor.name, returnAt: now });
        event("Regreso del taller", `${vehicleLabel(vehicle)} · ${payload.date}`);
      }
      return;
    }
    case "load": {
      assigned();
      require(availableOn(vehicle, trip.day) && !inUse(vehicle), "Selecciona una furgoneta disponible.");
      const box = clean(payload.box, 24);
      require(trip.stops.some(stop => stop.box === box), "Esa caja no pertenece a este viaje.");
      require(!trip.loaded.includes(box), "Esa caja ya está verificada.");
      trip.loaded.push(box);
      event("Caja cargada", box);
      return;
    }
    case "depart": {
      if (trip.status === "underway") return;
      assigned();
      require(availableOn(vehicle, trip.day) && !inUse(vehicle), "Furgoneta no disponible.");
      const inspection = inspectionFor(state, trip);
      require(inspection?.ready, "Hace falta una revisión válida de la furgoneta.");
      require(trip.stops.every(stop => trip.loaded.includes(stop.box)), "Faltan cajas por verificar.");
      trip.departureInspection = inspection;
      trip.departedAt = now;
      trip.status = "underway";
      event("Salida confirmada", vehicleLabel(vehicle));
      return;
    }
    case "deliver": {
      require(trip.status === "underway", "El viaje debe estar en ruta.");
      const stop = trip.stops[payload.stop];
      require(stop && !stop.delivered, "La parada no existe o ya está entregada.");
      require(trip.stops.find(item => !item.delivered) === stop, "Registra las paradas en el orden asignado.");
      require(clean(payload.box, 24) === stop.box, "La caja no corresponde a este hospital.");
      require(payload.received === true, "Confirma la recepción simulada.");
      stop.delivered = { at: now, driver: actor.name, receipt: "Recepción simulada" };
      event("Entrega registrada", `${hospitalLabel(stop.hospital)} · caja ${stop.box}`);
      return;
    }
    case "finish":
      if (trip.status === "finished") return;
      require(trip.status === "underway" && trip.stops.every(stop => stop.delivered), "Faltan entregas.");
      trip.finishedAt = now;
      trip.status = "finished";
      event("Viaje finalizado", "Todas las entregas registradas");
      return;
    default:
      throw new Error("Acción desconocida.");
  }
}
