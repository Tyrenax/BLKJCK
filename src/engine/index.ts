/**
 * Point d'entrée du moteur SABOT. Voir engine.ts pour les décisions de règles, types.ts pour le contrat.
 *
 *   import { createEngine } from './engine';
 *   const engine = createEngine(content);
 *   let { state, events } = engine.newRun('MA-GRAINE');
 *   ({ state, events } = engine.dispatch(state, { type: 'startTable' }));
 */
import { createEngine } from './engine';
import type { CreateEngine } from './types';

export { createEngine, IllegalActionError, type SabotEngine } from './engine';

// Outils purs utiles à l'UI et au simulateur.
export {
  cardChips,
  cardColors,
  cardHasSuit,
  cardLabel,
  cardSuits,
  cardValueOptions,
  ENHANCEMENT_IDS,
  handValue,
  isFaceRank,
  isTenRank,
  RANKS,
  rankValue,
  SUITS,
  suitColor,
} from './cards';
export { detectFigures, FIGURE_IDS, figureBase } from './figures';
export { createRng, hashSeed, randomSeed } from './rng';
export { ENHANCEMENT_VALUES, effectText, fmtNum, MAX_RETRIGGERS } from './scoring';
export { PHASES, SAVE_VERSION } from './save';
export { ACTION_TYPES } from './actions';
export { MAX_HISTORY, TABLE_LABELS } from './table';
export { DEFAULT_CARD_OFFER_COST, DEFAULT_MIN_DECK_SIZE } from './checks';
export { HookError } from './core';

// Vérification à la compilation : createEngine respecte la signature du contrat.
const _contract: CreateEngine = createEngine;
void _contract;
