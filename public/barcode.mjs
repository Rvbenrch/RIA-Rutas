// Code 39: narrow and wide alternating bars and spaces, most significant bit first.
const digits = [0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064];
const delimiter = 0x094;

export function barcode(code) {
  if (typeof code !== "string" || !/^\d{4,24}$/.test(code)) return "";
  const bars = [];
  let x = 10;
  for (const pattern of [delimiter, ...Array.from(code, char => digits[Number(char)]), delimiter]) {
    for (let i = 0; i < 9; i++) {
      const width = pattern & (1 << (8 - i)) ? 3 : 1;
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="34"/>`);
      x += width;
    }
    x++;
  }
  return `<svg class="barcode" role="img" aria-label="Código de caja ${code}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 34">${bars.join("")}</svg>`;
}
