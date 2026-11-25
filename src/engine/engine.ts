/**
 * SABOT — moteur pur et synchrone.
 *
 * dispatch(state, action) valide l'action (IllegalActionError sinon), travaille sur une copie profonde
 * et renvoie { state, events }. Le state reçu n'est jamais muté. Tout l'aléatoire passe par
 * RunState.rngState (même graine + mêmes actions = même partie).
 *
 * ─── Décisions de règles (tranchées par le moteur, signalées à bjck-41) ───
 *  • « Le total le plus haut gagne ; à total égal, un Blackjack naturel bat une main qui n'en est
 *    pas un » (règle validée par bjck-41). Naturel du joueur : exactement 2 cartes (As + 10/V/D/R),
 *    total 21, sans Tirer ni Doubler. Naturel du croupier : ses 2 cartes de départ, total 21.
 *    Deux naturels = égalité. Un 22 (limite relevée) bat donc un naturel du croupier, et un
 *    Blackjack perd contre le 22 du croupier quand sa limite est relevée (Le Sobre).
 *    Pas de « peek » : le croupier ne regarde sa carte cachée qu'à son tour.
 *  • Crevé après avoir doublé puis sauvé (défausse, combine, atout) : le Mult ×2 reste acquis et la
 *    main part directement au croupier (doubler engage à rester).
 *  • Fin anticipée : dès que le score de table atteint l'objectif, la table est gagnée au passage à
 *    la main suivante (nextHand) ; chaque main non jouée rapporte balance.moneyPerUnusedHand.
 *  • Crevé : si un crochet onBust sauve, la carte part sans consommer de défausse. Sinon, s'il reste
 *    une combine jouable en bustChoice, phase bustChoice ; sinon la main est résolue tout de suite
 *    (marque 0). Le croupier ne joue pas sur un crevé.
 *    La défausse ne sauve PAS d'un crevé (décision bjck-41 après simulation : sinon le risque de
 *    tirer disparaît) : « discard » est illégal en bustChoice, sauf si rules.discardAfterBust (atout).
 *    api.discardFromHand (combines, atouts) reste permis en bustChoice.
 *  • Égalité / défaite : Mult × pushMultKeep / lossMultKeep, jamais sous 1. Égalité convertie avant
 *    les crochets : dealerWinsPush -> 'loss', sinon pushCountsAsWin -> 'win'.
 *  • « hits » compte Tirer ET Doubler ; une carte donnée par api.drawToPlayer n'en est pas un.
 *  • Les cartes passées par l'Échange retournent à leur propriétaire en fin de main.
 *  • Sabot vide pendant une table : la défausse est remélangée dedans (événement deckReshuffled).
 *    Cas limite d'un deck très affiné. La Déchiqueteuse refuse de descendre sous balance.minDeckSize.
 *  • L'argent ne descend jamais sous 0 (addMoney négatif plafonné).
 *  • Une carte ajoutée au deck pendant une table la rejoint : dans le sabot si toDrawPile, sinon dans
 *    la défausse. Pendant une table, les cartes du deck sont donc toujours toutes sur la table.
 *  • Le salon change à l'encaissement de la table du patron : la boutique qui suit appartient déjà au
 *    salon suivant (nouveau patron affiché, nouveau privilège).
 *  • Vente d'objets permise partout sauf en pleine main (playerTurn / bustChoice).
 *  • Sabot de départ (newRun options.deckId, défaut : le premier de content.startingDecks) : appliqué
 *    avant le tirage du premier patron, dans l'ordre buildDeck -> mods -> moneyDelta -> onStart.
 *  • Pot-de-vin (skipTable) : les deux récompenses du salon (petite, grande) sont tirées avec le
 *    patron. La table sautée ne rapporte rien et n'ouvre pas de boutique ; la récompense s'applique
 *    une fois la table suivante présentée.
 *  • Mises (newRun options.stakeId, défaut : la première) : cumulatives, toutes les mises de rang
 *    ≤ choisie s'appliquent. Leurs mods et facteurs d'objectif vivent dans computeRules (pas dans
 *    runMods) ; leurs crochets passent avant ceux du patron et des atouts.
 *  • Mode sans fin : en phase victory, continueEndless encaisse la table du patron (tableWon), puis la
 *    partie continue normalement. Objectifs × balance.endlessGrowth par salon au-delà du dernier,
 *    patrons tirés parmi tous ; il n'y a plus de victoire, seulement une défaite.
 *  • Résumé : history (≤ 64 lignes), bestHand, death, seen ; remplis au fil de la partie.
 */
import { applyAction, enumerateActions, legalActions, whyIllegal } from './actions';
import { copyCard, handValue, makeStandardDeck, RANKS, SUITS } from './cards';
import { type Ctx, HookError, hookContext, makeCtx, tableInPlay, visiblePlayerCards } from './core';
import { detectFigures, FIGURE_IDS, figureBase } from './figures';
import { buildRegistry, type Registry } from './registry';
import { hashSeed, randomSeed } from './rng';
import { computeRules } from './rules';
import { cloneState, deserializeState, normalizeState, SAVE_VERSION, serializeState } from './save';
import { sanitizeState } from './sanitize';
import { isCardDebuffed } from './scoring';
import { sellValueOf, syncShop } from './shop';
import { createTableIntro, startSalon, syncTable } from './table';
import type {
  Action,
  Card,
  Content,
  DispatchResult,
  Engine,
  FigureId,
  FigurePreview,
  NewRunOptions,
  RunState,
  StartingDeckDef,
} from './types';

/** Action refusée par le moteur. `message` est affichable tel quel. */
export class IllegalActionError extends Error {
  readonly action: Action;
  constructor(message: string, action: Action) {
    super(message);
    this.name = 'IllegalActionError';
    this.action = action;
  }
}

/** Engine + extras propres au moteur (hors contrat, pour le simulateur et les tests). */
export interface SabotEngine extends Engine {
  /** Toutes les actions concrètes jouables maintenant (cibles de consommables échantillonnées). */
  enumerateActions(state: RunState): Action[];
  /**
   * dispatch sans journal d'événements, pour le simulateur : mêmes règles, même aléatoire, même
   * state final (prouvé par les tests), mais aucun événement conservé et pas d'objet résultat.
   */
  dispatchQuiet(state: RunState, action: Action): RunState;
}

function newRunState(reg: Registry, seed: string): RunState {
  const figureLevels = {} as Record<FigureId, number>;
  for (const f of FIGURE_IDS) figureLevels[f] = 1;
  return {
    version: SAVE_VERSION,
    seed,
    rngState: hashSeed(seed),
    phase: 'tableIntro',
    salon: 1,
    tableIndex: 0,
    bossId: '',
    money: reg.content.balance.startingMoney,
    deck: makeStandardDeck(1),
    atouts: [],
    consumables: [],
    privileges: [],
    figureLevels,
    runMods: [],
    table: null,
    shop: null,
    nextCardId: 53,
    nextUid: 1,
    stats: {
      handsPlayed: 0,
      handsWon: 0,
      busts: 0,
      dealerBusts: 0,
      blackjacks: 0,
      bestHandScore: 0,
      tablesWon: 0,
      cardsShredded: 0,
      tablesSkipped: 0,
      figureCounts: {},
    },
    flags: {},
    salonPrivilege: null,
    bossHistory: [],
    salonSkipRewards: [],
    history: [],
    seen: { atouts: [], consumables: [], privileges: [] },
  };
}

/** Applique un sabot de départ au state neuf (avant le premier salon). */
function applyStartingDeck(ctx: Ctx, def: StartingDeckDef): void {
  const s = ctx.s;
  s.deckId = def.id;
  if (def.buildDeck) {
    const standard = makeStandardDeck(1).map(({ rank, suit }) => ({ rank, suit }));
    const specs = def.buildDeck(standard);
    if (!Array.isArray(specs) || specs.length === 0) {
      throw new Error(`Sabot de départ « ${def.name} » : buildDeck doit renvoyer au moins une carte`);
    }
    s.deck = specs.map((spec, i) => {
      if (!RANKS.includes(spec.rank) || !SUITS.includes(spec.suit)) {
        throw new Error(`Sabot de départ « ${def.name} » : carte invalide ${JSON.stringify(spec)}`);
      }
      const card: Card = { id: i + 1, rank: spec.rank, suit: spec.suit };
      if (spec.enhancement) card.enhancement = spec.enhancement;
      return card;
    });
    s.nextCardId = s.deck.length + 1;
  }
  for (const m of def.mods ?? []) s.runMods.push({ ...m });
  if (def.moneyDelta) s.money = Math.max(0, Math.round(s.money + def.moneyDelta));
  if (def.onStart) {
    try {
      def.onStart.call(def, hookContext(ctx, null));
    } catch (e) {
      throw new HookError(`Sabot de départ « ${def.name} », onStart : ${e instanceof Error ? e.message : String(e)}`, e);
    }
    ctx.seq++;
  }
}

function previewFigure(reg: Registry, s: RunState): FigurePreview | null {
  const hand = s.table?.hand;
  if (!hand) return null;
  const r = computeRules(reg, s);
  const cards = visiblePlayerCards(hand);
  const v = handValue(cards, r.playerLimit);
  const figures = detectFigures(reg.content, cards, v, r, hand.hits);
  const figure = figures[0];
  const level = s.figureLevels[figure] ?? 1;
  return { figure, figures, level, ...figureBase(reg.content, figure, level) };
}

function visibleNextCard(reg: Registry, s: RunState): Card | null {
  const t = s.table;
  if (!t || !tableInPlay(s) || t.drawPile.length === 0) return null;
  const top = t.drawPile[0];
  return computeRules(reg, s).seeNextCard || top.enhancement === 'marquee' ? copyCard(top) : null;
}

export function createEngine(content: Content): SabotEngine {
  const reg = buildRegistry(content);

  return {
    content,

    newRun(seed?: string, options?: NewRunOptions): DispatchResult {
      const deckId = options?.deckId ?? content.startingDecks?.[0]?.id;
      const deckDef = deckId === undefined ? undefined : reg.startingDecks.get(deckId);
      if (deckId !== undefined && !deckDef) throw new Error(`Sabot de départ inconnu : « ${deckId} »`);
      const stakes = content.stakes ?? [];
      const stakeId = options?.stakeId ?? stakes[0]?.id;
      const stakeLevel = stakeId === undefined ? -1 : stakes.findIndex((x) => x.id === stakeId);
      if (stakeId !== undefined && stakeLevel < 0) throw new Error(`Mise inconnue : « ${stakeId} »`);
      const s = newRunState(reg, seed && seed.length ? seed : randomSeed());
      const ctx = makeCtx(reg, s);
      if (deckDef) applyStartingDeck(ctx, deckDef);
      if (stakeId !== undefined) {
        s.stakeId = stakeId;
        s.stakeLevel = stakeLevel;
        for (const stake of stakes.slice(0, stakeLevel + 1)) {
          if (!stake.onStart) continue;
          try {
            stake.onStart.call(stake, hookContext(ctx, null));
          } catch (e) {
            throw new HookError(`Mise « ${stake.name} », onStart : ${e instanceof Error ? e.message : String(e)}`, e);
          }
          ctx.seq++;
        }
      }
      startSalon(ctx, 1);
      createTableIntro(ctx);
      return { state: s, events: ctx.events };
    },

    dispatch(state: RunState, action: Action): DispatchResult {
      const why = whyIllegal(reg, state, action);
      if (why) throw new IllegalActionError(why, action);
      const s = normalizeState(cloneState(state));
      const ctx = makeCtx(reg, s);
      applyAction(ctx, action);
      syncTable(ctx);
      syncShop(ctx);
      return { state: s, events: ctx.events };
    },

    dispatchQuiet(state: RunState, action: Action): RunState {
      const why = whyIllegal(reg, state, action);
      if (why) throw new IllegalActionError(why, action);
      const s = normalizeState(cloneState(state));
      const ctx = makeCtx(reg, s, true);
      applyAction(ctx, action);
      syncTable(ctx);
      syncShop(ctx);
      return s;
    },

    legalActions: (s) => legalActions(reg, s),
    whyIllegal: (s, a) => whyIllegal(reg, s, a),
    enumerateActions: (s) => enumerateActions(reg, s),
    getRules: (s) => computeRules(reg, s),
    handValue: (cards, limit) => handValue(cards, limit),
    previewFigure: (s) => previewFigure(reg, s),
    visibleNextCard: (s) => visibleNextCard(reg, s),
    isDebuffed: (s, card) => isCardDebuffed(reg, s, card),
    sellValue: (s, uid) => sellValueOf(reg, s, uid),
    serialize: (s) => serializeState(s),
    deserialize: (json) => {
      // Ne lève jamais : une sauvegarde illisible ou devenue injouable donne null (l'UI repart du titre).
      try {
        const raw = deserializeState(json);
        const s = raw ? sanitizeState(reg, raw) : null;
        if (!s) return null;
        computeRules(reg, s);
        if (s.phase !== 'gameOver' && legalActions(reg, s).length === 0) return null;
        return s;
      } catch {
        return null;
      }
    },
  };
}
