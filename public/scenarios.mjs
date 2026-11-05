export const accounts = [
  { id: "chofer-01", name: "Chófer 01", role: "driver" },
  { id: "chofer-02", name: "Chófer 02", role: "driver" },
  { id: "chofer-03", name: "Chófer 03", role: "driver" },
  { id: "chofer-04", name: "Chófer 04", role: "driver" },
  { id: "coordinacion", name: "Coordinación", role: "coordinator" },
];

const destinations = ["Hospital Demo Ría", "Hospital Demo Faro", "Hospital Demo Duna"];
const journeys = [
  [1, 1, "2026-11-05", 1, [0], "Entrega de una caja"],
  [2, 2, "2026-11-05", 2, [0, 1], "Dos paradas y comprobación de carga"],
  [3, 3, "2026-11-05", 3, [1, 2], "Verificación de caja por destino"],
  [4, 4, "2026-11-05", 4, [2], "Taller y cambio de furgoneta"],
  [5, 4, "2026-11-06", 4, [0], "Regreso del taller en otra jornada"],
];

export function seed() {
  return {
    vehicles: Array.from({ length: 5 }, (_, i) => ({
      id: `F0${i + 1}`, plate: `FICTICIA-${i + 1}`, stays: [],
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
