/**
 * Routine de calage des objectifs (demande de bjck-41) :
 *  1. Salon 1 sans achat : objectif de base et facteurs de table pour 85 / 70 / 55 % de réussite.
 *  2. Croissance par salon (q) : le robot de base meurt en moyenne au salon visé (4,5).
 *  3. Accélération de fin de partie (salons 6–8) : le robot malin gagne dans 15–30 % des cas.
 * Le résultat se recopie dans src/content/balance.ts (salonBaseTargets, tableFactors).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Content, TableKind } from '../../src/engine/types';
import { runBatch } from './batch';
import { variantContent } from './engine';
import { mean } from './report';

export interface S1Goals {
  petite: number;
  grande: number;
  patron: number;
}

const KINDS: TableKind[] = ['petite', 'grande', 'patron'];

/** Taux de réussite par type de table au salon 1, tous objectifs égaux à x (robot de base sans achat). */
function s1Rates(base: Content, x: number, runs: number, seed: string): Record<TableKind, number> {
  const c = variantContent(base, {
    label: 'calage-s1',
    balance: {
      salonBaseTargets: [x, ...base.balance.salonBaseTargets.slice(1)],
      tableFactors: { petite: 1, grande: 1, patron: 1 },
    },
  });
  const { runs: rs } = runBatch(c, 'basic', { noBuy: true }, runs, seed, 1);
  const tables = rs.flatMap((r) => r.tables).filter((t) => t.salon === 1 && t.hands > 0);
  const out = {} as Record<TableKind, number>;
  for (const k of KINDS) {
    const ts = tables.filter((t) => t.kind === k);
    out[k] = ts.filter((t) => t.won).length / Math.max(1, ts.length);
  }
  return out;
}

/** Objectif qui donne exactement `goal` de réussite (interpolation log-linéaire sur une grille). */
function crossing(grid: { x: number; rate: number }[], goal: number): number {
  for (let i = 1; i < grid.length; i++) {
    const a = grid[i - 1]!;
    const b = grid[i]!;
    if (a.rate >= goal && b.rate <= goal) {
      const f = a.rate === b.rate ? 0 : (a.rate - goal) / (a.rate - b.rate);
      return Math.exp(Math.log(a.x) + f * (Math.log(b.x) - Math.log(a.x)));
    }
  }
  return goal > (grid[0]?.rate ?? 0) ? grid[0]!.x : grid[grid.length - 1]!.x;
}

export function calibrateS1(base: Content, goals: S1Goals, runs: number, seed: string, log: (s: string) => void) {
  const grid: Record<TableKind, { x: number; rate: number }[]> = { petite: [], grande: [], patron: [] };
  for (let x = 100; x <= 700; x = Math.round(x * 1.15)) {
    const r = s1Rates(base, x, runs, seed);
    for (const k of KINDS) grid[k].push({ x, rate: r[k] });
    log(`  objectif ${x} : petite ${(100 * r.petite).toFixed(0)} % · grande ${(100 * r.grande).toFixed(0)} % · patron ${(100 * r.patron).toFixed(0)} %`);
  }
  const xp = crossing(grid.petite, goals.petite);
  const xg = crossing(grid.grande, goals.grande);
  const xb = crossing(grid.patron, goals.patron);
  return { t1: xp, factors: { petite: 1, grande: round2(xg / xp), patron: round2(xb / xp) } };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Arrondi lisible : 2 chiffres significatifs (puis 3 au-delà de 1000). */
export function nice(x: number): number {
  const digits = x >= 1000 ? 3 : 2;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(x)) - digits + 1);
  return Math.round(x / p) * p;
}

/** Objectifs par salon : t1 × q^(s−1), × late^(s−5) au-delà du salon 5. */
export function targetsFrom(t1: number, q: number, late: number, salons: number): number[] {
  return Array.from({ length: salons }, (_, i) => nice(t1 * q ** i * late ** Math.max(0, i + 1 - 5)));
}

export interface GrowthResult {
  q: number;
  late: number;
  targets: number[];
}

function withTargets(base: Content, targets: number[], factors: Record<TableKind, number>): Content {
  return variantContent(base, { label: 'calage', balance: { salonBaseTargets: targets, tableFactors: factors } });
}

/**
 * Croissance géométrique q (objectif du salon s = t1 × q^(s−1)) telle que `measure` ≈ goal.
 * `measure` doit baisser quand q monte (victoires, salon moyen…). Recherche dichotomique.
 */
export function calibrateQ(
  base: Content,
  t1: number,
  factors: Record<TableKind, number>,
  measure: (c: Content) => number,
  goal: number,
  log: (s: string) => void,
  lo = 1.2,
  hi = 3.5,
  iterations = 7,
): number {
  for (let it = 0; it < iterations; it++) {
    const q = (lo + hi) / 2;
    const m = measure(withTargets(base, targetsFrom(t1, q, 1, base.balance.salons), factors));
    log(`  q = ${q.toFixed(3)} : ${m.toFixed(3)}`);
    if (m > goal) lo = q;
    else hi = q;
  }
  return (lo + hi) / 2;
}

/** Objectifs complets pour (t1, q, facteurs). */
export function contentWith(base: Content, t1: number, q: number, factors: Record<TableKind, number>): Content {
  return withTargets(base, targetsFrom(t1, q, 1, base.balance.salons), factors);
}

/** Taux de victoire du robot malin. */
export function smartWinRate(c: Content, runs: number, rollouts: number, seed: string): number {
  const { runs: rs } = runBatch(c, 'smart', { rollouts }, runs, seed);
  return rs.filter((r) => r.won).length / rs.length;
}

/**
 * Calage salon par salon sur la survie du robot malin : pour chaque salon s ≥ 2, l'objectif qui donne
 * goals[s−1] de passage parmi les parties qui atteignent s. Le rapport avec le salon précédent reste
 * dans [minRatio, maxRatio] pour garder une courbe lisible.
 */
export function calibrateSalons(
  base: Content,
  t1: number,
  factors: Record<TableKind, number>,
  goals: number[],
  runs: number,
  rollouts: number,
  seed: string,
  log: (s: string) => void,
  minRatio = 1.4,
  maxRatio = 2.2,
  resumeFile?: string,
): number[] {
  const salons = base.balance.salons;
  // Reprise après interruption : les salons déjà calés sont relus sur disque.
  let targets = [t1];
  if (resumeFile && existsSync(resumeFile)) {
    const saved = JSON.parse(readFileSync(resumeFile, 'utf8')) as { t1: number; targets: number[] };
    if (saved.t1 === t1) targets = saved.targets;
    log(`  reprise : salons déjà calés ${targets.join(', ')}`);
  }
  const save = () => resumeFile && writeFileSync(resumeFile, JSON.stringify({ t1, factors, targets }));
  for (let s = targets.length + 1; s <= salons; s++) {
    const prev = targets[s - 2]!;
    let lo = prev * minRatio;
    let hi = prev * maxRatio;
    for (let it = 0; it < 6; it++) {
      const mid = Math.sqrt(lo * hi);
      const full = [...targets, mid];
      while (full.length < salons) full.push(full[full.length - 1]! * 1.8);
      const { runs: rs } = runBatch(withTargets(base, full, factors), 'smart', { rollouts }, runs, `${seed}-s${s}`, s);
      const reached = rs.filter((r) => r.salonReached >= s);
      const rate = reached.filter((r) => r.salonReached > s).length / Math.max(1, reached.length);
      log(`  salon ${s}, objectif ${Math.round(mid)} : ${(100 * rate).toFixed(0)} % passent (${reached.length} arrivés)`);
      if (rate > goals[s - 1]!) lo = mid;
      else hi = mid;
    }
    targets.push(nice(Math.sqrt(lo * hi)));
    save();
  }
  return targets;
}

/** Salon moyen atteint par le robot de base. */
export function basicMeanSalon(c: Content, runs: number, seed: string): number {
  return mean(runBatch(c, 'basic', {}, runs, seed).runs.map((r) => r.salonReached));
}
