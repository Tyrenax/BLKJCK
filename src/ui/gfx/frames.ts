/**
 * Cadres en pixel art générés au démarrage et posés en `border-image` (neuf tranches) :
 * contours Nuit de 2 px, coins cassés, relief en aplats, ombre dure. Exposés en variables CSS.
 */
import { col, type ColorName } from '../core/palette';
import { ctx2d, makeCanvas, rect } from './pixel';

interface FrameSpec {
  fill: ColorName;
  /** Liseré intérieur clair en haut / sombre en bas. */
  light?: ColorName;
  dark?: ColorName;
  /** Cadre coloré de 2 px dans le contour. */
  trim?: ColorName;
  trimLight?: ColorName;
  trimDark?: ColorName;
  /** Épaisseur de l'ombre / tranche en bas (px logiques). */
  depth?: number;
  depthColor?: ColorName;
  dashed?: boolean;
  noOutline?: boolean;
}

const S = 16; // taille de la source (hors profondeur)
const C = 6; // tranche des coins

function draw(spec: FrameSpec): string {
  const depth = spec.depth ?? 0;
  const c = makeCanvas(S, S + depth);
  const g = ctx2d(c);
  const outline = col('nuit');
  // tranche / ombre portée
  if (depth > 0) {
    const dc = col(spec.depthColor ?? 'nuit');
    rect(g, 1, depth, S - 2, S, dc);
    rect(g, 0, depth + 1, S, S - 2, dc);
    if (spec.depthColor && spec.depthColor !== 'nuit') {
      rect(g, 0, S + depth - 2, S, 1, outline);
      rect(g, 1, S + depth - 1, S - 2, 1, outline);
      rect(g, 0, depth + 1, 1, S - 2, outline);
      rect(g, S - 1, depth + 1, 1, S - 2, outline);
    }
  }
  if (spec.dashed) {
    const k = col(spec.fill);
    for (let i = 1; i < S - 1; i++) {
      if ((i >> 1) % 2 === 0) {
        rect(g, i, 0, 1, 2, k);
        rect(g, i, S - 2, 1, 2, k);
        rect(g, 0, i, 2, 1, k);
        rect(g, S - 2, i, 2, 1, k);
      }
    }
    return c.toDataURL();
  }
  // contour à coins cassés
  if (!spec.noOutline) {
    rect(g, 1, 0, S - 2, S, outline);
    rect(g, 0, 1, S, S - 2, outline);
  }
  const o = spec.noOutline ? 0 : 1;
  rect(g, o, o, S - 2 * o, S - 2 * o, col(spec.fill));
  if (!spec.noOutline) {
    rect(g, 1, 1, 1, 1, outline);
    rect(g, S - 2, 1, 1, 1, outline);
    rect(g, 1, S - 2, 1, 1, outline);
    rect(g, S - 2, S - 2, 1, 1, outline);
  }
  let i = o;
  if (spec.trim) {
    const t = col(spec.trim);
    const tl = col(spec.trimLight ?? spec.trim);
    const td = col(spec.trimDark ?? spec.trim);
    rect(g, i + 1, i, S - 2 * i - 2, 2, tl);
    rect(g, i, i + 1, 2, S - 2 * i - 2, tl);
    rect(g, i + 1, S - i - 2, S - 2 * i - 2, 2, td);
    rect(g, S - i - 2, i + 1, 2, S - 2 * i - 2, td);
    rect(g, i + 2, i + 2, S - 2 * i - 4, S - 2 * i - 4, col(spec.fill));
    rect(g, S - i - 2, i + 1, 1, 1, t);
    rect(g, i + 1, S - i - 2, 1, 1, t);
    // fin liseré Nuit sous le cadre
    rect(g, i + 2, i + 2, S - 2 * i - 4, 1, outline);
    rect(g, i + 2, i + 2, 1, S - 2 * i - 4, outline);
    rect(g, i + 2, S - i - 3, S - 2 * i - 4, 1, outline);
    rect(g, S - i - 3, i + 2, 1, S - 2 * i - 4, outline);
    rect(g, i + 3, i + 3, S - 2 * i - 6, S - 2 * i - 6, col(spec.fill));
    i += 3;
  }
  if (spec.light) rect(g, i + 1, i, S - 2 * i - 2, 1, col(spec.light));
  if (spec.dark) rect(g, i + 1, S - i - 1, S - 2 * i - 2, 1, col(spec.dark));
  return c.toDataURL();
}

export const FRAMES: Record<string, FrameSpec> = {
  panel: { fill: 'prune', light: 'prune-clair', dark: 'prune-sombre', depth: 2 },
  'panel-flat': { fill: 'prune', light: 'prune-clair', dark: 'prune-sombre' },
  dark: { fill: 'nuit', light: 'nuit-clair', depth: 2 },
  ink: { fill: 'encre', light: 'nuit-clair', dark: 'nuit', depth: 2 },
  brass: { fill: 'prune', trim: 'laiton', trimLight: 'laiton-clair', trimDark: 'laiton-sombre', depth: 2 },
  'brass-dark': { fill: 'nuit', trim: 'laiton-sombre', trimLight: 'laiton', trimDark: 'laiton-nuit', depth: 2 },
  bordeaux: { fill: 'bordeaux', trim: 'bordeaux-clair', trimLight: 'bordeaux-clair', trimDark: 'bordeaux-sombre', depth: 2 },
  ivory: { fill: 'ivoire', light: 'ivoire', dark: 'ivoire-sombre', depth: 2 },
  'btn-prune': { fill: 'prune-clair', light: 'cendre-sombre', dark: 'prune', depth: 3, depthColor: 'prune-sombre' },
  'btn-prune-down': { fill: 'prune-clair', light: 'cendre-sombre', dark: 'prune', depth: 1, depthColor: 'prune-sombre' },
  'btn-petrole': { fill: 'petrole-clair', light: 'petrole-pale', dark: 'petrole', depth: 3, depthColor: 'petrole-sombre' },
  'btn-petrole-down': { fill: 'petrole-clair', light: 'petrole-pale', dark: 'petrole', depth: 1, depthColor: 'petrole-sombre' },
  'btn-bordeaux': { fill: 'bordeaux', light: 'bordeaux-clair', dark: 'bordeaux-sombre', depth: 3, depthColor: 'bordeaux-sombre' },
  'btn-bordeaux-down': { fill: 'bordeaux', light: 'bordeaux-clair', dark: 'bordeaux-sombre', depth: 1, depthColor: 'bordeaux-sombre' },
  'btn-ivory': { fill: 'ivoire', light: 'ivoire', dark: 'ivoire-sombre', depth: 3, depthColor: 'ivoire-ombre' },
  'btn-ivory-down': { fill: 'ivoire', light: 'ivoire', dark: 'ivoire-sombre', depth: 1, depthColor: 'ivoire-ombre' },
  'btn-off': { fill: 'prune-sombre', light: 'prune', depth: 1, depthColor: 'nuit' },
  'felt-line': { fill: 'petrole-clair', dashed: true },
  slot: { fill: 'prune-sombre', light: 'nuit', dark: 'prune' },
};

/** Génère les cadres et les expose en variables CSS : --f-<nom>. */
export function installFrames(): void {
  const root = document.documentElement;
  for (const [name, spec] of Object.entries(FRAMES)) {
    root.style.setProperty(`--f-${name}`, `url(${draw(spec)})`);
  }
  root.style.setProperty('--f-slice', `${C}`);
}
