/**
 * Le Carnet : le carnet à spirale du tricheur, sorti de la poche (touche C, ou clic sur le compteur).
 * Page de gauche : les figures (niveau, Jetons, Mult, fois marquées). Page de droite : les règles
 * en vigueur (en Laiton celles qui diffèrent de la base, avec leur cause), le patron, la règle de victoire.
 */
import type { FigureId, Rules, RunState } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { el, place } from '../core/stage';
import type { Game } from '../game';
import { fmt } from '../view/hud';
import { colorize } from '../view/tooltip';
import { Panel } from './common';

const FIG_ORDER: FigureId[] = ['blackjack', 'triple7', 'charlie', 'pile', 'couleur', 'paire', 'haute', 'petite'];

type RuleKey = keyof Rules;

const pct = (k: number) => `${Math.round(k * 100)} %`;
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/** Une règle en phrase courte. */
function phrase(key: RuleKey, r: Rules): string | null {
  switch (key) {
    case 'playerLimit': return `Ta limite : ${r.playerLimit}`;
    case 'dealerStandOn': return `Le croupier s'arrête à ${r.dealerStandOn}`;
    case 'dealerLimit': return `Le croupier crève au-delà de ${r.dealerLimit}`;
    case 'handsPerTable': return `${plural(r.handsPerTable, 'main')} par table`;
    case 'discardsPerTable': return `${plural(r.discardsPerTable, 'défausse')} par table`;
    case 'charlieSize': return `Charlie : ${r.charlieSize} cartes sans crever`;
    case 'doubleXMult': return `Doubler : ×${fmt(r.doubleXMult)} Mult`;
    case 'lossMultKeep': return r.lossMultKeep > 0 ? `Défaite : tu gardes ${pct(r.lossMultKeep)} de ton Mult` : 'Défaite : la banque garde ton Mult';
    case 'pushMultKeep': return r.pushMultKeep >= 1 ? 'Égalité : ton Mult est sauf' : `Égalité : tu gardes ${pct(r.pushMultKeep)} de ton Mult`;
    case 'pushCountsAsWin': return r.pushCountsAsWin ? 'Une égalité compte comme une victoire' : null;
    case 'dealerWinsPush': return r.dealerWinsPush ? 'Le croupier gagne les égalités' : null;
    case 'seeNextCard': return r.seeNextCard ? 'Tu vois la prochaine carte de ton sabot' : null;
    case 'seeDealerHole': return r.seeDealerHole ? 'Tu vois la carte cachée du croupier' : null;
    case 'canDouble': return r.canDouble ? null : 'Doubler est interdit';
    case 'canDiscard': return r.canDiscard ? null : 'Défausser est interdit';
    case 'atoutSlots': return `${plural(r.atoutSlots, 'emplacement')} d'atout`;
    case 'consumableSlots': return `${plural(r.consumableSlots, 'poche')} pour les combines`;
    case 'shopOffers': return `${plural(r.shopOffers, 'offre')} en boutique`;
    case 'interestCap': return `Intérêts plafonnés à ${r.interestCap} $`;
    case 'targetFactor': return r.targetFactor !== 1 ? `Objectif ×${fmt(r.targetFactor)}` : null;
    case 'hidePlayerFirstCard': return r.hidePlayerFirstCard ? 'Ta première carte arrive face cachée' : null;
    case 'dealerExtraDraws': return r.dealerExtraDraws > 0 ? `Le croupier tire ${plural(r.dealerExtraDraws, 'carte')} de plus` : null;
    case 'freeRerollsPerShop': return r.freeRerollsPerShop > 0 ? `${plural(r.freeRerollsPerShop, 'relance')} gratuite${r.freeRerollsPerShop > 1 ? 's' : ''} par boutique` : null;
    case 'rerollDiscount': return r.rerollDiscount > 0 ? `Relances : ${r.rerollDiscount} $ de moins` : null;
    case 'shredsPerShop': return `Déchiqueteuse : ${r.shredsPerShop} par boutique`;
    case 'discardAfterBust': return r.discardAfterBust ? 'Tu peux défausser après avoir crevé' : null;
    default: return null;
  }
}

/** Règles toujours écrites, même quand elles sont à leur valeur de base. */
const ALWAYS: RuleKey[] = ['playerLimit', 'dealerStandOn', 'handsPerTable', 'discardsPerTable', 'doubleXMult', 'lossMultKeep', 'pushMultKeep'];

export class Carnet {
  private panel: Panel;
  private left: HTMLElement;
  private right: HTMLElement;

  constructor(parent: HTMLElement, private game: Game) {
    const root = place(el('div', 'carnet', parent), 176, 56, 928, 612);
    this.panel = new Panel(root, 'bottom');
    el('div', 'cn-cover', root);
    this.left = el('div', 'cn-page left', root);
    this.right = el('div', 'cn-page right', root);
    const spiral = el('div', 'cn-spiral', root);
    for (let i = 0; i < 14; i++) el('div', 'cn-ring', spiral);
    root.addEventListener('click', (e) => e.stopPropagation());
  }

  isOpen(): boolean {
    return this.panel.open;
  }

  toggle(): void {
    if (this.panel.open) this.hide();
    else this.open();
  }

  open(): void {
    const s = this.game.state;
    if (!s) return;
    this.fill(s);
    sfx.flip();
    void this.panel.show();
  }

  hide(): void {
    void this.panel.hide();
  }

  primary(): void {
    this.hide();
  }

  refresh(): void {
    if (this.panel.open && this.game.state) this.fill(this.game.state);
  }

  /** Base des règles (balance), avec les défauts des clés étendues. */
  private baseRules(s: RunState): Rules {
    const eng = this.game.engine;
    const b = eng.content.balance.baseRules as Partial<Rules>;
    const r = eng.getRules(s);
    const out = { ...r } as Rules;
    for (const k of Object.keys(r) as RuleKey[]) {
      if (k in b) (out as unknown as Record<string, unknown>)[k] = b[k];
    }
    if (!('shredsPerShop' in b)) out.shredsPerShop = eng.content.balance.shredsPerShop;
    return out;
  }

  /** Pourquoi une règle diffère : on retire chaque cause candidate et on regarde si la règle bouge. */
  private causes(s: RunState, r: Rules): Map<RuleKey, string[]> {
    const eng = this.game.engine;
    const out = new Map<RuleKey, string[]>();
    const add = (keys: RuleKey[], name: string) => {
      for (const k of keys) {
        if (!out.has(k)) out.set(k, []);
        if (!out.get(k)!.includes(name)) out.get(k)!.push(name);
      }
    };
    const diff = (other: Rules) => (Object.keys(r) as RuleKey[]).filter((k) => r[k] !== other[k]);
    const safe = (f: () => Rules) => {
      try {
        return f();
      } catch {
        return r;
      }
    };
    for (const a of s.atouts) {
      const d = eng.content.atouts.find((x) => x.id === a.defId);
      if (!d) continue;
      add(diff(safe(() => eng.getRules({ ...s, atouts: s.atouts.filter((x) => x.uid !== a.uid) }))), d.name);
    }
    const t = s.table;
    if (t?.kind === 'patron') {
      const boss = eng.content.bosses.find((b) => b.id === t.bossId);
      add(diff(safe(() => eng.getRules({ ...s, table: { ...t, kind: 'petite', bossId: null } }))), boss?.name ?? 'le patron');
    }
    const nameOf = (src: string): string => {
      const c = eng.content;
      return (
        c.privileges.find((x) => x.id === src)?.name ??
        c.consumables.find((x) => x.id === src)?.name ??
        c.atouts.find((x) => x.id === src)?.name ??
        c.startingDecks?.find((x) => x.id === src)?.name ??
        c.skipRewards?.find((x) => x.id === src)?.name ??
        (c as { stakes?: { id: string; name: string }[] }).stakes?.find((x) => x.id === src)?.name ??
        src
      );
    };
    const mods = [...s.runMods, ...(t?.mods ?? []), ...(t?.hand?.mods ?? [])];
    for (const m of mods) add([m.key as RuleKey], nameOf(m.source));
    return out;
  }

  private fill(s: RunState): void {
    const eng = this.game.engine;
    const r = eng.getRules(s);
    // ── page de gauche : les figures
    const L = this.left;
    L.innerHTML = '';
    el('div', 'cn-title t-num', L, 'Les figures');
    el('div', 'cn-sub t-body', L, 'Une seule marque : la plus haute que ta main réussit.');
    const preview = s.table?.hand && (s.phase === 'playerTurn' || s.phase === 'bustChoice') ? eng.previewFigure(s) : null;
    const now = preview?.figure ?? s.table?.hand?.result?.figure ?? null;
    const counts = s.stats.figureCounts ?? {};
    const head = el('div', 'cn-row head t-num', L);
    for (const h of ['', 'niv.', 'Jetons', 'Mult', 'fois']) el('span', '', head, h);
    for (const id of FIG_ORDER) {
      const f = eng.content.figures[id];
      if (!f) continue;
      const lvl = s.figureLevels[id] ?? 1;
      const n = counts[id] ?? 0;
      const secret = id === 'triple7' && n === 0;
      const row = el('div', `cn-row t-num${now === id ? ' now' : ''}`, L);
      el('span', 'cn-fig', row, secret ? '???' : f.name);
      el('span', 'cn-lvl', row, String(lvl));
      el('span', 'cn-chips', row, secret ? '?' : fmt(f.baseChips + f.chipsPerLevel * (lvl - 1)));
      el('span', 'cn-mult', row, secret ? '?' : fmt(f.baseMult + f.multPerLevel * (lvl - 1)));
      el('span', 'cn-count', row, n ? `×${n}` : '');
      if (!secret) el('div', 'cn-desc t-body', L).innerHTML = colorize(f.description);
    }
    // ── page de droite : les règles
    const R = this.right;
    R.innerHTML = '';
    el('div', 'cn-title t-num', R, 'Les règles du soir');
    const base = this.baseRules(s);
    const causes = this.causes(s, r);
    const list = el('div', 'cn-rules', R);
    const keys = Object.keys(r) as RuleKey[];
    const shown = new Set<RuleKey>();
    const line = (k: RuleKey) => {
      if (shown.has(k)) return;
      const changed = r[k] !== base[k];
      if (!changed && !ALWAYS.includes(k)) return;
      const p = phrase(k, r);
      if (!p) return;
      shown.add(k);
      const li = el('div', `cn-rule t-body${changed ? ' changed' : ''}`, list);
      li.innerHTML = colorize(p);
      const c = changed ? causes.get(k) : undefined;
      if (c?.length) el('span', 'cn-cause', li, ` (${c.join(', ')})`);
    };
    for (const k of ALWAYS) line(k);
    for (const k of keys) line(k);
    const win = el('div', 'cn-win t-body', R, 'Le total le plus haut gagne ; à total égal, un Blackjack naturel l\'emporte.');
    const boss = eng.content.bosses.find((b) => b.id === s.bossId);
    if (boss) {
      const bx = el('div', 'cn-boss', R);
      el('div', 'cn-boss-lab t-num', bx, s.table?.kind === 'patron' ? 'ce soir, le patron' : `patron du salon ${s.salon}`);
      el('div', 'cn-boss-name t-gothic', bx, boss.name);
      el('div', 'cn-boss-rule t-body', bx).innerHTML = colorize(boss.description);
    }
    // page trop pleine (beaucoup de règles modifiées) : on retire d'abord la phrase générale,
    // puis les règles inchangées ; les règles en Laiton et le patron restent toujours
    const fits = () => R.scrollHeight <= R.clientHeight + 1;
    if (!fits()) win.remove();
    for (const e of [...list.querySelectorAll('.cn-rule:not(.changed)')].reverse()) {
      if (fits()) break;
      e.remove();
    }
  }
}
