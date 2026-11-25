/**
 * Colonne gauche : atouts (ordre = déclenchement, réordonnables par glisser-déposer)
 * et combines/faveurs. Clic = sélection, avec les actions possibles sous l'objet.
 */
import type { AtoutDef, AtoutInstance, ConsumableDef, ConsumableInstance, Engine, RunState } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { clock } from '../core/anim';
import { el, place, toStage } from '../core/stage';
import { drawEmblem, drawEmptySlot } from '../gfx/cardArt';
import { Sprite } from './sprite';
import { attachTip, hide as hideTip, type TipContent } from './tooltip';

const RARITY_NAME = { commun: 'Commun', 'peu-commun': 'Peu commun', rare: 'Rare', legendaire: 'Légendaire' } as const;

export const ITEMS = {
  atoutX: 50,
  atoutY: 254,
  atoutW: 248,
  consX: 50,
  consY: 372,
};

interface ItemEntry {
  sprite: Sprite;
  uid: number;
  defId: string;
  kind: 'atout' | 'consumable';
}

export interface ItemCallbacks {
  use(uid: number): void;
  sell(uid: number, kind: 'atout' | 'consumable'): void;
  reorder(order: number[]): void;
  canAct(): boolean;
  why(kind: 'use' | 'sell', uid: number): string | null;
  sellValue(uid: number): number;
  inShop(): boolean;
}

export function atoutText(d: AtoutDef, a: AtoutInstance | null, s?: RunState | null): string {
  if (typeof d.description === 'function') {
    try {
      return a ? d.description(a, s ?? undefined) : d.description({ uid: 0, defId: d.id, state: d.initialState?.() ?? {} }, s ?? undefined);
    } catch {
      return '';
    }
  }
  return d.description;
}

export class ItemsView {
  readonly atouts = new Map<number, ItemEntry>();
  readonly cons = new Map<number, ItemEntry>();
  private order: number[] = [];
  private consOrder: number[] = [];
  private slotEls: HTMLElement[] = [];
  private consSlotEls: HTMLElement[] = [];
  private countA: HTMLElement;
  private countC: HTMLElement;
  private menu: HTMLElement;
  selected: number | null = null;
  private drag: { e: ItemEntry; dx: number; dy: number; moved: boolean; sx: number; sy: number } | null = null;
  /** Point de départ d'un objet qui arrive (offre de boutique achetée). */
  spawnHint: { x: number; y: number } | null = null;
  private atoutSlots = 5;
  private consSlots = 2;
  private state: RunState | null = null;

  constructor(private tableLayer: HTMLElement, private layer: HTMLElement, private engine: () => Engine, private cb: ItemCallbacks) {
    this.countA = place(el('div', 'item-count t-num', tableLayer), 20, 298, 300, 20);
    this.countC = place(el('div', 'item-count t-num', tableLayer), 20, 416, 140, 20);
    this.menu = el('div', 'item-menu', layer);
    this.menu.classList.add('hidden');
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
  }

  private atoutPos(i: number, n: number): { x: number; y: number } {
    const slots = Math.max(n, this.atoutSlots);
    const spacing = slots <= 1 ? 0 : Math.min(62, ITEMS.atoutW / (slots - 1));
    return { x: ITEMS.atoutX + i * spacing, y: ITEMS.atoutY };
  }

  private consPos(i: number): { x: number; y: number } {
    return { x: ITEMS.consX + i * 62, y: ITEMS.consY };
  }

  /** Position d'écran d'un atout (pour les nombres qui jaillissent). */
  anchor(uid: number): { x: number; y: number } | null {
    const e = this.atouts.get(uid) ?? this.cons.get(uid);
    return e ? { x: e.sprite.x.value, y: e.sprite.y.value - 48 } : null;
  }

  sprite(uid: number): Sprite | null {
    return (this.atouts.get(uid) ?? this.cons.get(uid))?.sprite ?? null;
  }

  private make(kind: 'atout' | 'consumable', uid: number, defId: string, at: { x: number; y: number }): ItemEntry {
    const eng = this.engine();
    let face: HTMLCanvasElement;
    if (kind === 'atout') {
      const d = eng.content.atouts.find((a) => a.id === defId);
      face = d ? drawEmblem(d.art, 'atout', d.rarity) : drawEmptySlot();
    } else {
      const d = eng.content.consumables.find((c) => c.id === defId);
      face = d ? drawEmblem(d.art, d.kind) : drawEmptySlot();
    }
    const from = this.spawnHint ?? { x: at.x, y: -60 };
    this.spawnHint = null;
    const sp = new Sprite({ face, parent: this.layer, size: 1, x: from.x, y: from.y });
    sp.root.classList.add('item', 'clickable');
    if (kind === 'atout' && eng.content.atouts.find((a) => a.id === defId)?.rarity === 'legendaire') {
      sp.root.classList.add('legendary');
      el('div', 'glint', sp.overlay);
    }
    const entry: ItemEntry = { sprite: sp, uid, defId, kind };
    sp.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = toStage(e.clientX, e.clientY);
      this.drag = { e: entry, dx: p.x - sp.x.value, dy: p.y - sp.y.value, moved: false, sx: p.x, sy: p.y };
      e.preventDefault();
    });
    attachTip(sp.root, () => this.tip(entry));
    return entry;
  }

  private tip(e: ItemEntry): TipContent | null {
    if (this.drag?.moved) return null;
    const eng = this.engine();
    if (e.kind === 'atout') {
      const d = eng.content.atouts.find((a) => a.id === e.defId);
      if (!d) return null;
      const inst = this.state?.atouts.find((a) => a.uid === e.uid) ?? null;
      return { name: d.name, sub: `Atout ${RARITY_NAME[d.rarity].toLowerCase()}`, body: atoutText(d, inst, this.state), art: drawEmblem(d.art, 'atout', d.rarity), foot: this.sellLine(e) };
    }
    const d: ConsumableDef | undefined = eng.content.consumables.find((c) => c.id === e.defId);
    if (!d) return null;
    return { name: d.name, sub: d.kind === 'combine' ? 'Combine à usage unique' : 'Faveur', body: d.description, art: drawEmblem(d.art, d.kind), foot: this.sellLine(e) };
  }

  /** Dernière ligne de l'infobulle : « clic pour vendre, 3 $ » quand la vente est légale. */
  private sellLine(e: ItemEntry): string | undefined {
    if (!this.cb.canAct() || this.cb.why('sell', e.uid)) return undefined;
    return `clic pour vendre, ${this.cb.sellValue(e.uid)} $`;
  }

  private onMove(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p = toStage(ev.clientX, ev.clientY);
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 6) {
      if (d.e.kind !== 'atout' || !this.cb.canAct()) return;
      d.moved = true;
      hideTip();
      this.select(null);
      d.e.sprite.z = 900;
      d.e.sprite.scale.target = 1.12;
    }
    if (d.moved) {
      d.e.sprite.moveTo(p.x - d.dx, p.y - d.dy);
      // réordonne en direct
      const n = this.order.length;
      let idx = 0;
      for (let i = 0; i < n; i++) if (p.x - d.dx > this.atoutPos(i, n).x - 31) idx = i;
      const cur = this.order.indexOf(d.e.uid);
      if (idx !== cur) {
        this.order.splice(cur, 1);
        this.order.splice(idx, 0, d.e.uid);
        sfx.tick();
        this.layout(d.e.uid);
      }
    }
  }

  private onUp(_ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.e.sprite.scale.target = 1;
    if (d.moved) {
      const before = this.state?.atouts.map((a) => a.uid).join(',');
      this.layout();
      if (before !== this.order.join(',')) this.cb.reorder([...this.order]);
      return;
    }
    this.select(this.selected === d.e.uid ? null : d.e.uid);
  }

  select(uid: number | null): void {
    this.selected = uid;
    for (const e of [...this.atouts.values(), ...this.cons.values()]) e.sprite.raised = e.uid === uid;
    this.renderMenu();
  }

  private renderMenu(): void {
    const uid = this.selected;
    const e = uid !== null ? this.atouts.get(uid) ?? this.cons.get(uid) : undefined;
    this.menu.innerHTML = '';
    // le menu se pose sur l'étiquette « atouts n/5 » ou « poches n/2 » de sa rangée : elle s'efface le temps du menu
    this.countA.classList.toggle('under-menu', e?.kind === 'atout');
    this.countC.classList.toggle('under-menu', e?.kind === 'consumable');
    if (!e) {
      this.menu.classList.add('hidden');
      return;
    }
    this.menu.classList.remove('hidden');
    const x = e.sprite.x.target;
    const y = e.sprite.y.target + 50;
    this.menu.style.top = `${Math.round(y)}px`;
    const mk = (label: string, cls: string, why: string | null, fn: () => void) => {
      const b = el('button', `btn small ${cls}${why ? ' off' : ''}`, this.menu);
      b.innerHTML = label;
      attachTip(b, () => (why ? { name: label.replace(/<[^>]+>/g, ''), why } : null));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (why) {
          sfx.nope();
          return;
        }
        sfx.press();
        fn();
      });
    };
    if (e.kind === 'consumable') {
      mk('Jouer', 'petrole', this.cb.why('use', e.uid), () => {
        this.select(null);
        this.cb.use(e.uid);
      });
    }
    // « Vendre » dans toutes les phases où la vente est légale (et toujours visible en boutique)
    if (this.cb.inShop() || !this.cb.why('sell', e.uid)) {
      const v = this.cb.sellValue(e.uid);
      mk(`Vendre <span class="c-laiton">${v} $</span>`, '', this.cb.why('sell', e.uid), () => {
        this.select(null);
        this.cb.sell(e.uid, e.kind);
      });
    }
    if (!this.menu.children.length) this.menu.classList.add('hidden');
    // centré sous l'objet, mais jamais hors de la scène (le premier emplacement est près du bord)
    const half = this.menu.offsetWidth / 2;
    this.menu.style.left = `${Math.round(Math.max(8 + half, x))}px`;
  }

  private layout(dragging?: number): void {
    const n = this.order.length;
    this.order.forEach((uid, i) => {
      const e = this.atouts.get(uid);
      if (!e || uid === dragging) return;
      const p = this.atoutPos(i, n);
      e.sprite.moveTo(p.x, p.y, 0);
      e.sprite.z = 20 + i;
    });
    this.consOrder.forEach((uid, i) => {
      const e = this.cons.get(uid);
      if (!e) return;
      const p = this.consPos(i);
      e.sprite.moveTo(p.x, p.y, 0);
      e.sprite.z = 20 + i;
    });
    // emplacements vides
    const slots = Math.max(this.atoutSlots, n);
    while (this.slotEls.length < slots) {
      const s = el('canvas', 'item-slot', this.tableLayer) as unknown as HTMLElement;
      const src = drawEmptySlot();
      (s as unknown as HTMLCanvasElement).width = src.width;
      (s as unknown as HTMLCanvasElement).height = src.height;
      (s as unknown as HTMLCanvasElement).getContext('2d')!.drawImage(src, 0, 0);
      this.slotEls.push(s);
    }
    this.slotEls.forEach((s, i) => {
      const p = this.atoutPos(i, n);
      s.style.display = i < slots ? '' : 'none';
      s.style.transform = `translate(${p.x - 30}px, ${p.y - 42}px)`;
    });
    while (this.consSlotEls.length < this.consSlots) {
      const s = el('canvas', 'item-slot', this.tableLayer) as unknown as HTMLCanvasElement;
      const src = drawEmptySlot();
      s.width = src.width;
      s.height = src.height;
      s.getContext('2d')!.drawImage(src, 0, 0);
      this.consSlotEls.push(s as unknown as HTMLElement);
    }
    this.consSlotEls.forEach((s, i) => {
      const p = this.consPos(i);
      s.style.display = i < this.consSlots ? '' : 'none';
      s.style.transform = `translate(${p.x - 30}px, ${p.y - 42}px)`;
    });
    this.countA.textContent = `atouts ${n}/${this.atoutSlots}`;
    this.countC.textContent = `poches ${this.consOrder.length}/${this.consSlots}`;
    this.renderMenu();
  }

  /** Ajoute un objet avec son arrivée. */
  add(kind: 'atout' | 'consumable', uid: number, defId: string): ItemEntry {
    const map = kind === 'atout' ? this.atouts : this.cons;
    const ord = kind === 'atout' ? this.order : this.consOrder;
    let e = map.get(uid);
    if (e) return e;
    const idx = ord.length;
    const at = kind === 'atout' ? this.atoutPos(idx, idx + 1) : this.consPos(idx);
    e = this.make(kind, uid, defId, at);
    map.set(uid, e);
    ord.push(uid);
    this.layout();
    sfx.card();
    return e;
  }

  /** Retire un objet (vendu, utilisé, détruit). */
  remove(uid: number): void {
    const e = this.atouts.get(uid) ?? this.cons.get(uid);
    if (!e) return;
    this.atouts.delete(uid);
    this.cons.delete(uid);
    this.order = this.order.filter((x) => x !== uid);
    this.consOrder = this.consOrder.filter((x) => x !== uid);
    if (this.selected === uid) this.selected = null;
    const sp = e.sprite;
    if (clock.skipping) sp.destroy();
    else {
      sp.z = 950;
      sp.scale.target = 0;
      sp.moveTo(sp.x.value, sp.y.value - 30, 20);
      setTimeout(() => sp.destroy(), 260);
    }
    this.layout();
  }

  sync(s: RunState): void {
    this.state = s;
    const r = s.table || s.phase === 'shop' ? this.engine().getRules(s) : null;
    this.atoutSlots = r?.atoutSlots ?? 5;
    this.consSlots = r?.consumableSlots ?? 2;
    const aIds = new Set(s.atouts.map((a) => a.uid));
    for (const uid of [...this.atouts.keys()]) if (!aIds.has(uid)) this.remove(uid);
    const cIds = new Set(s.consumables.map((c) => c.uid));
    for (const uid of [...this.cons.keys()]) if (!cIds.has(uid)) this.remove(uid);
    for (const a of s.atouts) this.add('atout', a.uid, a.defId);
    for (const c of s.consumables) this.add('consumable', c.uid, c.defId);
    this.order = s.atouts.map((a) => a.uid);
    this.consOrder = s.consumables.map((c) => c.uid);
    this.layout();
  }

  setVisible(on: boolean): void {
    for (const e of [...this.atouts.values(), ...this.cons.values()]) e.sprite.root.style.visibility = on ? '' : 'hidden';
    for (const s of [...this.slotEls, ...this.consSlotEls]) s.style.visibility = on ? '' : 'hidden';
    this.countA.style.visibility = on ? '' : 'hidden';
    this.countC.style.visibility = on ? '' : 'hidden';
    if (!on) this.select(null);
  }

  consDef(defId: string): ConsumableDef | undefined {
    return this.engine().content.consumables.find((c) => c.id === defId);
  }
  consInstance(uid: number): ConsumableInstance | undefined {
    return this.state?.consumables.find((c) => c.uid === uid);
  }
}
