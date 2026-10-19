// Cache by the complete RGB value: nearby UI colors must not share a scan-order
// dependent RGB565 match. One mapper is reused for the entire global palette.
export function createPaletteMapper(palette) {
  if (!palette.length || palette.length > 256) throw new Error('Expected 1–256 palette colors');
  const cache = new Int16Array(1 << 24).fill(-1);
  return rgba => {
    const pixels = new Uint8Array(rgba.length / 4);
    for (let offset = 0, pixel = 0; offset < rgba.length; offset += 4, pixel++) {
      const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
      const key = (r << 16) | (g << 8) | b;
      let index = cache[key];
      if (index < 0) {
        let distance = Infinity;
        for (let candidate = 0; candidate < palette.length; candidate++) {
          const color = palette[candidate];
          const error = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
          if (error < distance) { distance = error; index = candidate; }
        }
        cache[key] = index;
      }
      pixels[pixel] = index;
    }
    return pixels;
  };
}
