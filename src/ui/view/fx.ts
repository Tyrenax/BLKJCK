/**
 * Effets ponctuels : nombres qui jaillissent, annonces gothiques, éclats de pixels.
 * Tout arrive avec un ressort, repart vite sans rebond.
 */
import { clock, ease, tween, wait } from '../core/anim';
import { el } from '../core/stage';

let layer: HTMLElement;
export function initFx(fxLayer: HTMLElement): void {
  layer = fxLayer;
}

export type PopKind = 'chips' | 'mult' | 'xmult' | 'money' | 'plain' | 'bad' | 'dim';

/** Nombre qui jaillit au-dessus d'une source (« +10 » Menthe, « +4 » Braise, « ×2 » sur fond Braise). */
export function pop(x: number, y: number, text: string, kind: PopKind = 'plain', big = false): void {
  if (clock.skipping) return;
  const e = el('div', `pop pop-${kind}${big ? ' big' : ''}`, layer, text);
  e.style.left = `${Math.round(x)}px`;
  e.style.top = `${Math.round(y)}px`;
  void tween(260, (k) => {
    e.style.transform = `translate(-50%, -50%) translateY(${(-14 * k).toFixed(1)}px) scale(${(0.3 + 0.7 * k).toFixed(3)})`;
  }, ease.outBack).then(() => wait(380)).then(() => tween(140, (k) => {
    e.style.transform = `translate(-50%, -50%) translateY(${(-14 - 8 * k).toFixed(1)}px) scale(${(1 - k * 0.7).toFixed(3)})`;
    e.style.opacity = String(1 - k);
  }, ease.inCubic)).then(() => e.remove());
}

/** Annonce en gothique au centre (« Blackjack », « Crevé »). */
export async function announce(text: string, opts: { y?: number; tone?: 'ivoire' | 'cerise' | 'bordeaux' | 'laiton'; hold?: number; size?: number } = {}): Promise<void> {
  if (clock.skipping) return;
  const e = el('div', `announce t-gothic tone-${opts.tone ?? 'ivoire'}`, layer, text);
  e.style.top = `${opts.y ?? 340}px`;
  if (opts.size) e.style.fontSize = `${opts.size}px`;
  await tween(300, (k) => {
    e.style.transform = `translate(-50%, -50%) scale(${(1.8 - 0.8 * k).toFixed(3)}) rotate(${(-6 + 4 * k).toFixed(2)}deg)`;
    e.style.opacity = String(Math.min(1, k * 2));
  }, ease.outBack);
  await wait(opts.hold ?? 520);
  await tween(160, (k) => {
    e.style.transform = `translate(-50%, -50%) scale(${(1 - 0.3 * k).toFixed(3)}) rotate(-2deg)`;
    e.style.opacity = String(1 - k);
  }, ease.inCubic);
  e.remove();
}

/** Éclats de pixels (Mult brisé, carte détruite). Cosmétique : Math.random autorisé. */
export function shards(x: number, y: number, color: string, n = 14, spread = 60): void {
  if (clock.skipping) return;
  for (let i = 0; i < n; i++) {
    const s = el('div', 'shard', layer);
    s.style.background = color;
    s.style.left = `${Math.round(x)}px`;
    s.style.top = `${Math.round(y)}px`;
    const vx = (Math.random() * 2 - 1) * spread;
    const vy = -Math.random() * spread * 1.2;
    const size = Math.random() > 0.6 ? 6 : 4;
    s.style.width = s.style.height = `${size}px`;
    void tween(620 + Math.random() * 200, (_k, t) => {
      const px = vx * t * 1.4;
      const py = vy * t * 1.4 + 260 * t * t;
      s.style.transform = `translate(${Math.round(px / 2) * 2}px, ${Math.round(py / 2) * 2}px)`;
      s.style.opacity = t > 0.8 ? String((1 - t) * 5) : '1';
    }, (t) => t).then(() => s.remove());
  }
}

/** Flash plein cadre d'une couleur (très bref). */
export function flash(color: string, ms = 160, alpha = 0.35): void {
  if (clock.skipping) return;
  const f = el('div', 'flash', layer);
  f.style.background = color;
  void tween(ms, (k) => {
    f.style.opacity = String(alpha * (1 - k));
  }, ease.outCubic).then(() => f.remove());
}
