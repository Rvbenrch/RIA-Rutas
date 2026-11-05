export function routeScene(stops, escape) {
  const width = Math.max(390, stops.length * 115 + 55);
  const buildings = stops.map((stop, i) => {
    const x = 85 + i * 115;
    const y = i % 2 ? 162 : 94;
    return `<g transform="translate(${x} ${y})">
      <path d="M-36 0 0-18 36 0 0 18Z" fill="#fff1db"/>
      <path d="M-36 0 0 18V63L-36 45Z" fill="#eaa97b"/>
      <path d="M36 0 0 18V63L36 45Z" fill="#cb765e"/>
      <path d="M-27 13l10 5v12l-10-5zm16 8 8 4v12l-8-4z" fill="#365c72"/>
      <path d="M9 31l8-4v12l-8 4zm15-8 8-4v12l-8 4z" fill="#365c72"/>
      <path d="M-9-2 9-11m-18 0L9-2" stroke="#a63842" stroke-width="4"/>
      <a href="#stop-${i}" aria-label="Ir a la parada ${i + 1}: ${escape(stop.hospital)}">
      <circle cx="0" cy="-27" r="22" fill="transparent"/>
      <circle cx="0" cy="-27" r="15" fill="${stop.delivered ? "#0b6e63" : "#12324a"}"/>
      <text x="0" y="-22" text-anchor="middle" fill="white" font-size="13" font-weight="700">${i + 1}</text>
      </a>
    </g>`;
  }).join("");
  return `<figure class="route-scene">
    <figcaption><strong>Vista de la ruta</strong><small>Esquema ilustrativo</small></figcaption>
    <div class="scene-scroll"><svg aria-label="Paradas del viaje" width="${width}" height="245" viewBox="0 0 ${width} 245" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="tiles" width="36" height="18" patternUnits="userSpaceOnUse"><path d="M0 9 18 0l18 9-18 9Z" fill="none" stroke="#d2e6dc"/></pattern></defs>
      <rect width="100%" height="100%" fill="#e3f1e9"/><rect width="100%" height="100%" fill="url(#tiles)"/>
      <path d="M-25 190 290 34H${Math.max(420, stops.length * 115 + 80)}" fill="none" stroke="#49647a" stroke-width="33"/>
      <path d="M-25 190 290 34H${Math.max(420, stops.length * 115 + 80)}" fill="none" stroke="#f6dda0" stroke-width="2" stroke-dasharray="12 9"/>
      ${buildings}
      <g transform="translate(132 179)">
        <path d="M0 8 34-9l20 10-34 17Z" fill="#fff4d1"/><path d="M0 8 20 18v14L0 22Z" fill="#d09547"/>
        <path d="M20 18 54 1v14L20 32Z" fill="#f2c66d"/><path d="M37 12l11-6v7l-11 6Z" fill="#365c72"/>
        <ellipse cx="28" cy="28" rx="4" ry="6" fill="#18364b"/><ellipse cx="48" cy="18" rx="4" ry="6" fill="#18364b"/>
      </g>
    </svg></div>
    <div class="scene-stops">${stops.map((stop, i) =>
      `<button type="button" class="secondary" data-stop="${i}"><b>${i + 1}</b> ${escape(stop.hospital)}<small>${stop.delivered ? "Entregada" : "Pendiente de entrega"}</small></button>`).join("")}</div>
  </figure>`;
}
