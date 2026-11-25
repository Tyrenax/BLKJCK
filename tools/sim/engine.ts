/**
 * Moteur vu par le simulateur : createEngine(content) + index des définitions,
 * et fabrication de variantes de contenu (règles de base, objectifs).
 */
import { createEngine, type SabotEngine } from '../../src/engine/index';
import type { AtoutDef, BalanceConfig, BaseRules, ConsumableDef, Content } from '../../src/engine/types';

export interface SimEngine extends SabotEngine {
  atoutById: Map<string, AtoutDef>;
  consumableById: Map<string, ConsumableDef>;
}

export function simEngine(content: Content): SimEngine {
  const e = createEngine(content) as SimEngine;
  e.atoutById = new Map(content.atouts.map((a) => [a.id, a]));
  e.consumableById = new Map(content.consumables.map((c) => [c.id, c]));
  return e;
}

export interface Variant {
  label: string;
  rules?: Partial<BaseRules>;
  /** Multiplie tous les objectifs de base. */
  targetScale?: number;
  balance?: Partial<BalanceConfig>;
}

export function variantContent(base: Content, v: Variant): Content {
  const balance: BalanceConfig = {
    ...base.balance,
    ...v.balance,
    baseRules: { ...base.balance.baseRules, ...v.rules } as BaseRules,
  };
  if (v.targetScale && v.targetScale !== 1) {
    balance.salonBaseTargets = balance.salonBaseTargets.map((t) => Math.max(1, Math.round(t * v.targetScale!)));
  }
  return { ...base, balance };
}

/** « handsPerTable=5,lossMultKeep=0.25 » -> objet de règles. */
export function parseRules(spec: string | undefined): Partial<BaseRules> {
  const out: Record<string, number | boolean> = {};
  if (!spec) return out as Partial<BaseRules>;
  for (const part of spec.split(',')) {
    const [k, raw] = part.split('=');
    if (!k || raw === undefined) continue;
    out[k.trim()] = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
  }
  return out as Partial<BaseRules>;
}
