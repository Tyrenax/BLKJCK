/**
 * Règles effectives, recalculées à la demande :
 *   base (balance, complétée par les défauts du moteur) -> runMods -> mises (cumulatives) -> table.mods -> hand.mods
 *   -> patron.modifyRules (seulement à la table du patron) -> atouts.modifyRules (gauche -> droite)
 *   -> bornes de sécurité (mains ≥ 1, défausses ≥ 0, Charlie ≥ 2…) -> plafond balance.maxPlayerLimit.
 */
import type { Registry } from './registry';
import type { BossDef, BooleanRuleKey, NumericRuleKey, Rules, RuleMod, RunState } from './types';

export function baseRules(reg: Registry): Rules {
  return { ...reg.baseRules };
}

export function applyRuleMod(rules: Rules, mod: RuleMod): void {
  if ('add' in mod) {
    rules[mod.key] = (rules[mod.key] ?? 0) + mod.add;
  } else if (typeof mod.set === 'number') {
    rules[mod.key as NumericRuleKey] = mod.set;
  } else {
    rules[mod.key as BooleanRuleKey] = mod.set;
  }
}

/** Patron actif : seulement à la table du patron (table.bossId renseigné). */
export function activeBoss(reg: Registry, state: Readonly<RunState>): BossDef | null {
  const id = state.table?.bossId;
  return id ? (reg.bosses.get(id) ?? null) : null;
}

function clamp(rules: Rules): void {
  const int = (v: number, min: number): number => (Number.isFinite(v) ? Math.max(min, Math.round(v)) : min);
  rules.handsPerTable = int(rules.handsPerTable, 1);
  rules.discardsPerTable = int(rules.discardsPerTable, 0);
  rules.charlieSize = int(rules.charlieSize, 2);
  rules.atoutSlots = int(rules.atoutSlots, 0);
  rules.consumableSlots = int(rules.consumableSlots, 0);
  rules.shopOffers = int(rules.shopOffers, 0);
  rules.interestCap = int(rules.interestCap, 0);
  rules.dealerExtraDraws = int(rules.dealerExtraDraws, 0);
  rules.freeRerollsPerShop = int(rules.freeRerollsPerShop, 0);
  rules.shredsPerShop = int(rules.shredsPerShop, 0);
  rules.shopPriceAdd = Number.isFinite(rules.shopPriceAdd) ? Math.round(rules.shopPriceAdd ?? 0) : 0;
  rules.bossSalonAdvance = int(rules.bossSalonAdvance ?? 0, 0);
  rules.rerollDiscount = Number.isFinite(rules.rerollDiscount) ? rules.rerollDiscount : 0;
  if (!Number.isFinite(rules.playerLimit)) rules.playerLimit = 21;
  if (!Number.isFinite(rules.dealerLimit)) rules.dealerLimit = 21;
  if (!Number.isFinite(rules.dealerStandOn)) rules.dealerStandOn = 17;
  if (!(rules.targetFactor > 0)) rules.targetFactor = 1;
  rules.lossMultKeep = Math.max(0, rules.lossMultKeep || 0);
  rules.pushMultKeep = Math.max(0, rules.pushMultKeep || 0);
  if (!Number.isFinite(rules.doubleXMult)) rules.doubleXMult = 2;
}

export function computeRules(reg: Registry, state: Readonly<RunState>): Rules {
  const rules = baseRules(reg);
  for (const m of state.runMods) applyRuleMod(rules, m);
  // Mises (cumulatives) : leurs mods, leur facteur d'objectif, leurs modifyRules.
  const level = state.stakeLevel;
  if (level !== undefined && level >= 0) {
    for (const stake of (reg.content.stakes ?? []).slice(0, level + 1)) {
      for (const m of stake.mods ?? []) applyRuleMod(rules, m);
      if (stake.targetFactor !== undefined) rules.targetFactor *= stake.targetFactor;
      stake.hooks?.modifyRules?.(rules, null, state);
    }
  }
  const table = state.table;
  if (table) {
    for (const m of table.mods) applyRuleMod(rules, m);
    if (table.hand) for (const m of table.hand.mods) applyRuleMod(rules, m);
  }
  const boss = activeBoss(reg, state);
  boss?.hooks.modifyRules?.(rules, null, state);
  for (const inst of state.atouts) {
    reg.atouts.get(inst.defId)?.hooks.modifyRules?.(rules, inst, state);
  }
  clamp(rules);
  const cap = reg.content.balance.maxPlayerLimit;
  if (cap !== undefined && rules.playerLimit > cap) rules.playerLimit = cap;
  return rules;
}
