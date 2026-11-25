import type { Suit } from '../../engine/types';
import { maskFromRows, rasterize, type Mask } from './pixel';

/** Petites enseignes dessinées à la main (7×7) : lisibles au pixel près. */
const SMALL: Record<Suit, string[]> = {
  hearts: [
    '.XX.XX.',
    'XXXXXXX',
    'XXXXXXX',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...',
  ],
  diamonds: [
    '...X...',
    '..XXX..',
    '.XXXXX.',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...',
  ],
  spades: [
    '...X...',
    '..XXX..',
    '.XXXXX.',
    'XXXXXXX',
    'XXXXXXX',
    '..XXX..',
    '.XXXXX.',
  ],
  clubs: [
    '..XXX..',
    '..XXX..',
    'XX.X.XX',
    'XXXXXXX',
    'XX.X.XX',
    '..XXX..',
    '.XXXXX.',
  ],
};

const TINY: Record<Suit, string[]> = {
  hearts: ['XX.XX', 'XXXXX', '.XXX.', '..X..'],
  diamonds: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'],
  spades: ['..X..', '.XXX.', 'XXXXX', '..X..', '.XXX.'],
  clubs: ['.XXX.', 'XXXXX', 'XXXXX', '..X..', '.XXX.'],
};

const circle = (u: number, v: number, cx: number, cy: number, r: number) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
const tri = (u: number, v: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const d1 = (u - bx) * (ay - by) - (ax - bx) * (v - by);
  const d2 = (u - cx) * (by - cy) - (bx - cx) * (v - cy);
  const d3 = (u - ax) * (cy - ay) - (cx - ax) * (v - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

const SHAPES: Record<Suit, (u: number, v: number) => boolean> = {
  hearts: (u, v) =>
    circle(u, v, -0.46, -0.38, 0.52) || circle(u, v, 0.46, -0.38, 0.52) || tri(u, v, -0.97, -0.22, 0.97, -0.22, 0, 0.98),
  diamonds: (u, v) => Math.abs(u) / 0.78 + Math.abs(v) <= 1,
  spades: (u, v) =>
    circle(u, v, -0.45, 0.2, 0.47) ||
    circle(u, v, 0.45, 0.2, 0.47) ||
    tri(u, v, -0.92, 0.1, 0.92, 0.1, 0, -0.98) ||
    tri(u, v, 0, 0.25, -0.42, 0.98, 0.42, 0.98),
  clubs: (u, v) =>
    circle(u, v, 0, -0.5, 0.4) ||
    circle(u, v, -0.5, 0.12, 0.4) ||
    circle(u, v, 0.5, 0.12, 0.4) ||
    circle(u, v, 0, -0.02, 0.28) ||
    tri(u, v, 0, 0.0, -0.4, 0.98, 0.4, 0.98),
};

const bigCache = new Map<string, Mask>();

export function suitMask(suit: Suit, size: 'tiny' | 'small' | number): Mask {
  if (size === 'tiny') return maskFromRows(TINY[suit]);
  if (size === 'small') return maskFromRows(SMALL[suit]);
  const key = `${suit}|${size}`;
  let m = bigCache.get(key);
  if (!m) {
    m = rasterize(size, size, SHAPES[suit], 4);
    bigCache.set(key, m);
  }
  return m;
}

export const SUIT_CHARS: Record<string, Suit> = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
export const SUIT_SYMBOL: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
export const SUIT_NAME: Record<Suit, string> = { spades: 'pique', hearts: 'cœur', diamonds: 'carreau', clubs: 'trèfle' };
export const isRed = (s: Suit) => s === 'hearts' || s === 'diamonds';
