/**
 * Gera imagens procedurais (SVG -> data URI) para simular fotos de rocha
 * (microtomografia / MEV) sem depender de assets externos ou rede.
 * `intensity` controla o quanto de "corrosão" (wormholes) aparece na textura.
 */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function rockImageDataUri(
  seed: string,
  variant: "before" | "after",
  baseHue = 28
): string {
  const h = hashSeed(seed + variant);
  const freq = (0.01 + (h % 40) / 1000).toFixed(3);
  const seedNum = h % 100;
  const isAfter = variant === "after";

  // "before": textura mineral homogênea e escura.
  // "after": mais clara, com canais de dissolução (wormholes) simulados por manchas radiais.
  const lightness = isAfter ? 62 : 38;
  const wormholeSpots = isAfter
    ? Array.from({ length: 6 }, (_, i) => {
        const cx = 15 + ((h >> i) % 70);
        const cy = 15 + ((h >> (i + 3)) % 70);
        const r = 4 + ((h >> (i + 5)) % 10);
        return `<circle cx="${cx}%" cy="${cy}%" r="${r}" fill="url(#wormhole)" opacity="0.85" />`;
      }).join("")
    : "";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs>
    <filter id="noise-${seed}-${variant}">
      <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${seedNum}" result="turb" />
      <feColorMatrix in="turb" type="matrix"
        values="0 0 0 0 ${(baseHue % 100) / 255}
                0 0 0 0 ${(baseHue % 80) / 255}
                0 0 0 0 ${(baseHue % 60) / 255}
                0 0 0 1 0" />
    </filter>
    <radialGradient id="wormhole" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1c1917" stop-opacity="0.9" />
      <stop offset="70%" stop-color="#57534e" stop-opacity="0.5" />
      <stop offset="100%" stop-color="#57534e" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="base-${variant}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${baseHue} 25% ${lightness + 8}%)" />
      <stop offset="100%" stop-color="hsl(${baseHue} 20% ${lightness - 10}%)" />
    </linearGradient>
  </defs>
  <rect width="480" height="480" fill="url(#base-${variant})" />
  <rect width="480" height="480" filter="url(#noise-${seed}-${variant})" opacity="0.55" />
  ${wormholeSpots}
  <rect width="480" height="480" fill="none" stroke="#00000022" stroke-width="2" />
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
