/** Petites briques partagées par les écrans d'extension. */
import type { Card, EmblemArt, FigureId, Rarity, RunState } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { ease, tween, wait } from '../core/anim';
import { el } from '../core/stage';
import { col } from '../core/palette';
import { drawEmblem, type EmblemKind } from '../gfx/cardArt';
import type { Game } from '../game';
import { fmt } from '../view/hud';
import { faceOf } from '../view/table';

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Silhouette d'un objet jamais rencontré : l'emblème réel, repassé pixel par pixel. Les contours
 * Nuit restent Nuit, le glyphe (l'Ivoire, le plus clair) devient Prune, tout le reste Prune sombre :
 * on devine la forme sans voir l'objet.
 */
function silhouette(src: HTMLCanvasElement): HTMLCanvasElement {
  const g = src.getContext('2d')!;
  const img = g.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  const dark = rgbOf(col('prune-sombre'));
  const glyph = rgbOf(col('prune'));
  const ink = rgbOf(col('nuit'));
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const c = lum > 0.78 ? glyph : lum < 0.09 ? ink : dark;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return src;
}

export function emblemOrSilhouette(art: EmblemArt, kind: EmblemKind, seen: boolean, rarity?: Rarity): HTMLCanvasElement {
  // la rareté reste secrète tant que l'objet n'a pas été vu
  return seen ? drawEmblem(art, kind, rarity) : silhouette(drawEmblem(art, kind));
}

/** « 120 × 8 = 960 » : Jetons en Menthe, Mult en Braise, score en Ivoire. */
export function scoreLine(chips: number, mult: number, score: number): string {
  return `<span class="c-menthe">${fmt(chips)}</span> <span class="c-cendre">×</span> <span class="c-braise">${fmt(mult)}</span> <span class="c-cendre">=</span> ${fmt(score)}`;
}

export function figureName(game: Game, f: FigureId): string {
  return game.engine.content.figures[f]?.name ?? f;
}

export function tableKindName(kind: 'petite' | 'grande' | 'patron'): string {
  return kind === 'petite' ? 'Petite table' : kind === 'grande' ? 'Grande table' : 'Table du patron';
}

/**
 * Distribue une rangée de cartes, une par une, depuis le coin du sabot du croupier (en haut à droite
 * de la scène) : chaque carte part de là, glisse et se pose, avec son souffle de carte.
 */
export async function dealRow(parent: HTMLElement, cards: readonly Card[], o: { gap?: number; width: number; scale?: 1 | 2 }): Promise<void> {
  const scale = o.scale ?? 1;
  const w = 60 * scale;
  const n = cards.length;
  const step = n <= 1 ? 0 : Math.min(w + (o.gap ?? 8), (o.width - w) / (n - 1));
  const from = parent.getBoundingClientRect();
  const stage = parent.closest('.stage')?.getBoundingClientRect();
  const k = stage ? stage.width / 1280 : 1;
  // départ : le sabot du croupier, en haut à droite de la scène, exprimé dans le repère du parent
  const sx = stage ? (stage.left + 1178 * k - from.left) / k : o.width;
  const sy = stage ? (stage.top - 120 * k - from.top) / k : -200;
  const els = cards.map((c, i) => {
    const f = faceOf(c);
    f.className = `x-card${scale === 2 ? ' x2' : ''}`;
    f.style.left = `${Math.round(i * step)}px`;
    f.style.top = '0px';
    f.style.zIndex = String(i + 1);
    f.style.visibility = 'hidden';
    parent.appendChild(f);
    return f;
  });
  for (let i = 0; i < els.length; i++) {
    const f = els[i];
    const x = Math.round(i * step);
    f.style.visibility = 'visible';
    sfx.card();
    void tween(
      380,
      (t) => {
        const px = sx + (x - sx) * t;
        const py = sy + (0 - sy) * t;
        const tilt = (1 - t) * 14;
        f.style.transform = `translate(${(px - x).toFixed(1)}px, ${py.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`;
      },
      ease.outBack,
    );
    await wait(110);
  }
}

/** Nom affichable du sabot et de la mise d'une partie. */
export function runLabel(game: Game, s: RunState): string {
  const c = game.engine.content;
  const deck = s.deckId ? c.startingDecks?.find((d) => d.id === s.deckId)?.name : undefined;
  const stake = s.stakeId ? c.stakes?.find((x) => x.id === s.stakeId)?.name : undefined;
  return [deck ?? 'Sabot classique', stake].filter(Boolean).join(', ');
}

export function lab(parent: HTMLElement, text: string, cls = ''): HTMLElement {
  return el('div', `x-lab t-num ${cls}`, parent, text);
}
