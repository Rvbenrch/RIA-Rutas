const controls = [
  "Funcionan las luces delanteras y de posición.",
  "Funcionan las luces de freno y los intermitentes.",
  "Los neumáticos no presentan daños visibles.",
  "Los retrovisores permiten ver con claridad.",
  "El parabrisas permite ver con claridad.",
  "Funcionan los limpiaparabrisas y el lavaparabrisas.",
  "El cinturón del puesto de conducción funciona.",
  "El freno de servicio responde en la comprobación previa.",
  "El freno de estacionamiento mantiene inmóvil el vehículo.",
  "El cuadro no muestra avisos de avería que impidan circular.",
  "No se observan fugas visibles bajo el vehículo.",
  "Las puertas de carga cierran correctamente.",
  "Los elementos de sujeción de la carga están en buen estado.",
  "La zona de carga está limpia y libre de objetos sueltos.",
  "Hay combustible o autonomía suficiente para el recorrido.",
  "La luz interior de la zona de carga funciona.",
  "El lector de códigos está disponible y funciona.",
  "El soporte auxiliar del terminal está en buen estado.",
];

export const checks = controls.map((text, i) => ({
  id: `c${i + 1}`, text, blocking: i < 15,
}));

export function inspect(answers, measure) {
  if (!answers || typeof answers !== "object" || Object.keys(answers).length !== checks.length) {
    throw new Error("Completa los 18 controles.");
  }
  const results = checks.map(check => {
    const answer = answers[check.id];
    const valid = check.blocking ? ["OK", "NO"] : ["OK", "NO", "NA"];
    if (!valid.includes(answer)) throw new Error(`Respuesta inválida: ${check.text}`);
    return { ...check, answer };
  });
  if (results.some(item => item.answer === "NO") && !measure) {
    throw new Error("Indica la medida adoptada.");
  }
  return { results, measure, ready: !results.some(item => item.blocking && item.answer === "NO") };
}
