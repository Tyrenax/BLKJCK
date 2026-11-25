/**
 * Marquage d'une main (DESIGN.md §3), dans cet ordre exact :
 *  1. scoreStart : Jetons et Mult de base de la figure (selon son niveau).
 *  2. Pour chaque carte du joueur, de gauche à droite (une carte neutralisée ne fait rien) :
 *       [re-déclenchements : un scoreStep « Encore ! » avant chaque passage supplémentaire]
 *       + valeur de la carte en Jetons -> amélioration -> onCardScored (patron, puis atouts).
 *  3. onHandScored (patron, puis atouts de gauche à droite).
 *  4. Doublé : ×rules.doubleXMult.
 *  5. Verdict : égalité -> Mult × pushMultKeep, défaite -> Mult × lossMultKeep (jamais sous 1).
 *  6. Si un effet portait `nullify` : Jetons à 0 (scoreStep « Main annulée »), score 0.
 * Chaque ScoreEffect s'applique dans l'ordre Jetons, Mult, ×Mult, argent et produit UN scoreStep.
 * Les Jetons ne descendent jamais sous 0 ; le Mult est arrondi au centième ; score = floor(Jetons × Mult).
 * L'argent gagné pendant le marquage est porté par scoreStep.money (pas de moneyChanged en double).
 */
import { cardChips, copyCard } from './cards';
import { callHook, changeMoney, type Ctx, eachHolder, emit, type Holder, holders, holderSource, rulesOf } from './core';
import { figureBase } from './figures';
import type { Registry } from './registry';
import type {
  Card,
  FigureId,
  GameEvent,
  Outcome,
  RunState,
  ScoreEffect,
  ScoreEffects,
  ScoreSource,
  ScoringContext,
} from './types';

/** Valeurs chiffrées des améliorations de carte (sémantique moteur). */
export const ENHANCEMENT_VALUES = {
  plombeeChips: 30,
  ardenteMult: 4,
  cristalXMult: 2,
  cristalBreakChance: 0.25,
  doreeMoney: 2,
  elastiqueDrop: 3,
} as const;

/** Plafond de re-déclenchements accordés par un même porteur à une même carte. */
export const MAX_RETRIGGERS = 5;

type ScoreStepEvent = Extract<GameEvent, { type: 'scoreStep' }>;

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Nombre à la française (« 1,5 »). */
export function fmtNum(x: number): string {
  return String(round2(x)).replace('.', ',');
}

function signed(x: number): string {
  return x >= 0 ? `+${fmtNum(x)}` : `−${fmtNum(-x)}`;
}

/** Texte par défaut d'un effet : « +4 Mult », « ×2 Mult », « +30 Jetons · +2 $ ». */
export function effectText(e: ScoreEffect): string {
  const parts: string[] = [];
  if (e.chips) parts.push(`${signed(e.chips)} Jetons`);
  if (e.mult) parts.push(`${signed(e.mult)} Mult`);
  if (e.xMult !== undefined && e.xMult !== 1) parts.push(`×${fmtNum(e.xMult)} Mult`);
  if (e.money) parts.push(`${signed(e.money)} $`);
  return parts.join(' · ');
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function toArray(effects: ScoreEffects): ScoreEffect[] {
  if (!effects) return [];
  return Array.isArray(effects) ? effects : [effects];
}

/** Carte neutralisée (patron, ou atout qui définirait isCardDebuffed). */
export function isCardDebuffed(reg: Registry, s: Readonly<RunState>, card: Card): boolean {
  for (const h of holders(reg, s)) {
    const fn = h.hooks.isCardDebuffed;
    if (fn && fn.call(h.hooks, card, s)) return true;
  }
  return false;
}

export interface ScoreInput {
  outcome: Exclude<Outcome, 'bust'>;
  dealerBust: boolean;
  playerTotal: number;
  dealerTotal: number;
  figure: FigureId;
  figures: FigureId[];
}

export interface ScoreOutput {
  chips: number;
  mult: number;
  score: number;
  /** Cartes cristal qui ont marqué (candidates à la casse). */
  cristalScored: number[];
}

export function scoreHand(ctx: Ctx, input: ScoreInput): ScoreOutput {
  const s = ctx.s;
  const hand = s.table!.hand!;
  const r = rulesOf(ctx);
  const level = s.figureLevels[input.figure] ?? 1;
  const base = figureBase(ctx.reg.content, input.figure, level);
  let chips = base.chips;
  let mult = base.mult;
  let nullified = false;
  emit(ctx, { type: 'scoreStart', figure: input.figure, level, chips, mult });

  const margin = input.playerTotal - (input.dealerBust ? 0 : input.dealerTotal);
  const sc = (h: Holder): ScoringContext => ({
    state: s,
    rules: r,
    rng: ctx.rng,
    self: h.kind === 'atout' ? h.inst : null,
    playerCards: hand.playerCards.map(copyCard),
    dealerCards: hand.dealerCards.map(copyCard),
    playerTotal: input.playerTotal,
    dealerTotal: input.dealerTotal,
    margin,
    outcome: input.outcome,
    dealerBust: input.dealerBust,
    figure: input.figure,
    figures: [...input.figures],
    hits: hand.hits,
    doubled: hand.doubled,
    discards: hand.discards,
    chips,
    mult,
  });

  const step = (source: ScoreSource, e: ScoreEffect, defaultText?: string): void => {
    const ev: ScoreStepEvent = { type: 'scoreStep', source, text: '', chipsAfter: 0, multAfter: 0 };
    let any = false;
    if (num(e.chips) && e.chips !== 0) {
      chips = Math.max(0, round2(chips + e.chips));
      ev.chips = e.chips;
      any = true;
    }
    if (num(e.mult) && e.mult !== 0) {
      mult = round2(mult + e.mult);
      ev.mult = e.mult;
      any = true;
    }
    if (num(e.xMult) && e.xMult !== 1) {
      mult = round2(mult * e.xMult);
      ev.xMult = e.xMult;
      any = true;
    }
    if (num(e.money) && e.money !== 0) {
      const d = changeMoney(ctx, e.money, 'Marquage', true);
      if (d !== 0) ev.money = d;
      any = true;
    }
    if (e.nullify) {
      nullified = true;
      any = true;
    }
    if (!any && !e.text) return;
    ev.text = e.text ?? defaultText ?? effectText(e);
    ev.chipsAfter = chips;
    ev.multAfter = mult;
    emit(ctx, ev);
  };
  const apply = (effects: ScoreEffects, source: ScoreSource): void => {
    for (const e of toArray(effects)) if (e && typeof e === 'object') step(source, e);
  };
  const current = (id: number): Card | undefined => hand.playerCards.find((c) => c.id === id);

  // 2. Les cartes, de gauche à droite.
  const cristal = new Set<number>();
  for (const id of hand.playerCards.map((c) => c.id)) {
    const first = current(id);
    if (!first) continue;
    if (isCardDebuffed(ctx.reg, s, first)) {
      step({ kind: 'card', cardId: id }, { text: 'Neutralisée' });
      continue;
    }
    const passes: ScoreSource[] = [];
    eachHolder(ctx, (h, hooks) => {
      const fn = hooks.retriggers;
      if (!fn) return;
      const n = callHook(ctx, h, 'retriggers', () => fn.call(hooks, sc(h), copyCard(first)));
      const k = Math.max(0, Math.min(MAX_RETRIGGERS, Math.floor(Number(n) || 0)));
      for (let i = 0; i < k; i++) passes.push(holderSource(h, id));
    });
    for (let pass = 0; pass <= passes.length; pass++) {
      const card = current(id);
      if (!card) break;
      if (pass > 0) step(passes[pass - 1], { text: 'Encore !' });
      const v = cardChips(card);
      step({ kind: 'card', cardId: id }, { chips: v }, `+${v}`);
      const enh = card.enhancement;
      if (enh) {
        const src: ScoreSource = { kind: 'enhancement', cardId: id, enhancement: enh };
        if (enh === 'plombee') step(src, { chips: ENHANCEMENT_VALUES.plombeeChips });
        else if (enh === 'ardente') step(src, { mult: ENHANCEMENT_VALUES.ardenteMult });
        else if (enh === 'cristal') {
          step(src, { xMult: ENHANCEMENT_VALUES.cristalXMult });
          cristal.add(id);
        } else if (enh === 'doree' && input.outcome === 'win') step(src, { money: ENHANCEMENT_VALUES.doreeMoney });
      }
      eachHolder(ctx, (h, hooks) => {
        const fn = hooks.onCardScored;
        const cur = current(id);
        if (!fn || !cur) return;
        apply(
          callHook(ctx, h, 'onCardScored', () => fn.call(hooks, sc(h), copyCard(cur))),
          holderSource(h, id),
        );
      });
    }
  }

  // 3. Les atouts (et le patron) sur la main entière.
  eachHolder(ctx, (h, hooks) => {
    const fn = hooks.onHandScored;
    if (fn) apply(callHook(ctx, h, 'onHandScored', () => fn.call(hooks, sc(h))), holderSource(h));
  });

  // 4. Doublé.
  if (hand.doubled) step({ kind: 'rule', label: 'Doublé' }, { xMult: r.doubleXMult }, `Doublé ×${fmtNum(r.doubleXMult)}`);

  // 5. Verdict.
  if (input.outcome === 'push' || input.outcome === 'loss') {
    const keep = input.outcome === 'push' ? r.pushMultKeep : r.lossMultKeep;
    mult = Math.max(1, round2(mult * keep));
    const label = input.outcome === 'push' ? 'Égalité' : 'Défaite';
    const text =
      input.outcome === 'loss' && keep === 0 ? 'Défaite : la banque garde ton Mult' : `${label} : Mult ×${fmtNum(keep)}`;
    emit(ctx, {
      type: 'scoreStep',
      source: { kind: 'rule', label },
      xMult: keep,
      text,
      chipsAfter: chips,
      multAfter: mult,
    });
  }

  // 6. Main annulée (ScoreEffect.nullify) : les Jetons tombent à 0, quoi qu'aient ajouté les suivants.
  if (nullified && chips !== 0) {
    const lost = chips;
    chips = 0;
    emit(ctx, {
      type: 'scoreStep',
      source: { kind: 'rule', label: 'Annulée' },
      chips: -lost,
      text: 'Main annulée',
      chipsAfter: chips,
      multAfter: mult,
    });
  }

  const score = nullified ? 0 : Math.max(0, Math.floor(chips * mult));
  return { chips, mult, score, cristalScored: [...cristal] };
}
