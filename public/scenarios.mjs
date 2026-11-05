export const accounts = [
  { id: "chofer-01", name: "Lucía Ortega Molina", role: "driver" },
  { id: "chofer-02", name: "Álvaro Ruiz Medina", role: "driver" },
  { id: "chofer-03", name: "Nuria Campos León", role: "driver" },
  { id: "chofer-04", name: "Mateo Vargas Serrano", role: "driver" },
  { id: "coordinacion", name: "Coordinación", role: "coordinator" },
];

export const destinations = [
  "Hospital Universitario Regional de Málaga",
  "Hospital Universitario Virgen de la Victoria",
  "Hospital Civil",
];
const fleet = {
  F01: { model: "Mercedes-Benz Sprinter", plate: "4301 DEM" },
  F02: { model: "Ford Transit", plate: "4302 DEM" },
  F03: { model: "Volkswagen Crafter", plate: "4303 DEM" },
  F04: { model: "Renault Master", plate: "4304 DEM" },
  F05: { model: "Mercedes-Benz Vito", plate: "4305 DEM" },
};

export function vehicleLabel(vehicle) {
  if (!vehicle) return "Sin asignar";
  const entry = fleet[vehicle.id];
  return entry ? `${entry.model} · ${vehicle.plate?.startsWith("FICTICIA-") ? entry.plate : vehicle.plate}` : vehicle.plate;
}

export function hospitalLabel(hospital) {
  const index = ["Hospital Demo Ría", "Hospital Demo Faro", "Hospital Demo Duna"].indexOf(hospital);
  return index === -1 ? hospital : destinations[index];
}
const journeys = [
  [1, 1, "2026-11-05", 1, [0], "Entrega de una caja"],
  [2, 2, "2026-11-05", 2, [0, 1], "Dos paradas y comprobación de carga"],
  [3, 3, "2026-11-05", 3, [1, 2], "Verificación de caja por destino"],
  [4, 4, "2026-11-05", 4, [2], "Taller y cambio de furgoneta"],
  [5, 4, "2026-11-06", 4, [0], "Regreso del taller en otra jornada"],
];

export function seed() {
  return {
    vehicles: Object.entries(fleet).map(([id, { plate }]) => ({
      id, plate, stays: [],
    })),
    inspections: [],
    trips: journeys.map(([number, driver, day, van, stops, title]) => ({
      id: `V0${number}`, title, day, driver: `chofer-0${driver}`,
      vehicle: `F0${van}`, status: "assigned", loaded: [], events: [],
      stops: stops.map((hospital, i) => ({
        hospital: destinations[hospital], box: `10${number}0${i + 1}`, delivered: null,
      })),
    })),
  };
}
