/**
 * Outils de dessin en pixels nets : pas d'anticrénelage, tout à la grille.
 * Les canvas sont dessinés à leur résolution logique puis affichés ×2 en `pixelated`.
 */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d', { willReadFrequently: false })!;
  g.imageSmoothingEnabled = false;
  return g;
}

export function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function dot(g: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** Masque booléen : mask[y][x]. */
export type Mask = boolean[][];

export function maskFromRows(rows: string[]): Mask {
  return rows.map((r) => [...r].map((ch) => ch !== '.' && ch !== ' '));
}

export function maskSize(m: Mask): { w: number; h: number } {
  return { w: m[0]?.length ?? 0, h: m.length };
}

export function drawMask(g: CanvasRenderingContext2D, m: Mask, x: number, y: number, color: string, flip = false): void {
  g.fillStyle = color;
  const h = m.length;
  for (let j = 0; j < h; j++) {
    const row = flip ? m[h - 1 - j] : m[j];
    for (let i = 0; i < row.length; i++) {
      const ii = flip ? row.length - 1 - i : i;
      if (row[ii]) g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
}

/** Contour d'un masque (pixels voisins hors masque), utile pour cerner en Nuit. */
export function outlineMask(m: Mask, diag = false): Mask {
  const h = m.length + 2;
  const w = (m[0]?.length ?? 0) + 2;
  const at = (x: number, y: number) => y >= 0 && y < m.length && x >= 0 && x < m[0].length && m[y][x];
  const out: Mask = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < w; x++) {
      const sx = x - 1;
      const sy = y - 1;
      if (at(sx, sy)) { row.push(false); continue; }
      let n = at(sx - 1, sy) || at(sx + 1, sy) || at(sx, sy - 1) || at(sx, sy + 1);
      if (diag) n = n || at(sx - 1, sy - 1) || at(sx + 1, sy - 1) || at(sx - 1, sy + 1) || at(sx + 1, sy + 1);
      row.push(n);
    }
    out.push(row);
  }
  return out;
}

/** Rasterise une forme implicite inside(u, v) avec u, v dans [-1, 1], échantillonnée au centre des pixels. */
export function rasterize(w: number, h: number, inside: (u: number, v: number) => boolean, ss = 3): Mask {
  const m: Mask = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < w; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = ((x + (sx + 0.5) / ss) / w) * 2 - 1;
          const v = ((y + (sy + 0.5) / ss) / h) * 2 - 1;
          if (inside(u, v)) hits++;
        }
      }
      row.push(hits * 2 > ss * ss);
    }
    m.push(row);
  }
  return m;
}

// ───────────── Texte en pixels nets (seuil sur l'alpha) ─────────────

const textCache = new Map<string, Mask>();
let scratch: HTMLCanvasElement | null = null;

/**
 * Rend un texte en masque binaire : on dessine la police (anticrénelée par le navigateur)
 * puis on seuille l'alpha. Avec les polices pixel (Jersey, Jacquard) le résultat est net.
 */
export function textMask(text: string, font: string, threshold = 110): Mask {
  const key = `${font}|${text}|${threshold}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  scratch ??= makeCanvas(256, 128);
  const g = scratch.getContext('2d', { willReadFrequently: true })!;
  g.font = font;
  const met = g.measureText(text);
  const asc = Math.ceil(met.actualBoundingBoxAscent);
  const desc = Math.ceil(met.actualBoundingBoxDescent);
  const left = Math.ceil(met.actualBoundingBoxLeft);
  const w = Math.max(1, Math.ceil(met.actualBoundingBoxRight) + left + 2);
  const h = Math.max(1, asc + desc + 2);
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  g.clearRect(0, 0, scratch.width, scratch.height);
  g.font = font;
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.fillText(text, left + 1, asc + 1);
  const data = g.getImageData(0, 0, w, h).data;
  const m: Mask = [];
  // rogne les lignes / colonnes vides
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    const empty: Mask = [[false]];
    textCache.set(key, empty);
    return empty;
  }
  for (let y = minY; y <= maxY; y++) {
    const row: boolean[] = [];
    for (let x = minX; x <= maxX; x++) row.push(data[(y * w + x) * 4 + 3] >= threshold);
    m.push(row);
  }
  textCache.set(key, m);
  return m;
}

/** Concatène des masques horizontalement avec un espacement. Alignés en bas. */
export function hconcat(masks: Mask[], gap = 1): Mask {
  const h = Math.max(...masks.map((m) => m.length));
  const out: Mask = Array.from({ length: h }, () => []);
  masks.forEach((m, k) => {
    const mw = m[0]?.length ?? 0;
    const off = h - m.length;
    for (let y = 0; y < h; y++) {
      const src = y - off >= 0 ? m[y - off] : null;
      for (let x = 0; x < mw; x++) out[y].push(src ? src[x] : false);
      if (k < masks.length - 1) for (let x = 0; x < gap; x++) out[y].push(false);
    }
  });
  return out;
}

/** Bruit de valeur déterministe (pour les textures : usure, guillochis). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Matrice de Bayer 4×4 pour le tramage ordonné. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function bayer(x: number, y: number): number {
  return BAYER4[(y & 3) * 4 + (x & 3)];
}

/** Copie un canvas (un canvas ne peut vivre qu'à un endroit du DOM). */
export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}
