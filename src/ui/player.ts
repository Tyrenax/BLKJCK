/**
 * Lecteur d'événements : rejoue pas à pas le journal renvoyé par le moteur.
 * Chaque type d'événement a son animation et son son. « Passer » termine tout d'un coup.
 */
import type { Card, GameEvent, RunState } from '../engine/types';
import { sfx } from './audio/sfx';
import { clock, ease, finishAll, shakeScreen, tween, wait } from './core/anim';
import { col } from './core/palette';
import type { Game } from './game';
import { announce, flash, pop, shards } from './view/fx';
import { fmt } from './view/hud';
import { faceOf, backOf, POS } from './view/table';
import { Sprite } from './view/sprite';

/** Respiration entre deux cartes de la donne (temps de jeu) : environ 470 ms par carte à ×1. */
const DEAL_BREATH = 80;

export class EventPlayer {
  playing = false;
  private holdType: string | null = null;
  private holdN = 0;
  private seen = new Map<string, number>();

  private midType: string | null = null;
  private midN = 0;
  private seenMid = 0;

  constructor(private game: Game) {
    const mid = import.meta.env.DEV ? new URLSearchParams(location.search).get('holdmid') : null;
    if (mid) {
      const [t, n] = mid.split(':');
      this.midType = t;
      this.midN = Number(n ?? 1);
    }
    const h = import.meta.env.DEV ? new URLSearchParams(location.search).get('hold') : null;
    if (h) {
      const [t, n] = h.split(':');
      this.holdType = t;
      this.holdN = Number(n ?? 1);
    }
  }

  skip(): void {
    if (!this.playing || clock.skipping) return;
    clock.skipping = true;
    finishAll();
  }

  async play(events: GameEvent[], before: RunState, after: RunState): Promise<void> {
    this.playing = true;
    if (this.game.turbo) clock.skipping = true;
    const ctx: PlayCtx = { before, after, step: 0, outcome: null, dealerBust: false, dealing: false, pending: [], lastMult: 0 };
    try {
      for (const ev of events) {
        const t0 = clock.now;
        // ?holdmid=type:n&freeze=ms : fige l'image EN COURS d'animation (captures)
        if (this.midType === ev.type && (this.seenMid = this.seenMid + 1) === this.midN) {
          const ms = Number(new URLSearchParams(location.search).get('freeze') ?? 200);
          void wait(ms).then(() => (clock.speed = 0));
        }
        await this.one(ev, ctx);
        this.game.eventTimes[ev.type] = (this.game.eventTimes[ev.type] ?? 0) + (clock.now - t0);
        const k = (this.seen.get(ev.type) ?? 0) + 1;
        this.seen.set(ev.type, k);
        if (this.holdType === ev.type && k === this.holdN && !clock.skipping) {
          const freezeAfter = Number(new URLSearchParams(location.search).get('freeze') ?? 120);
          await wait(freezeAfter);
          clock.speed = 0; // capture d'écran figée (?hold=type:n&freeze=ms)
          await new Promise(() => {});
        }
      }
      await Promise.all(ctx.pending);
    } catch (err) {
      this.game.errors.push(`lecture : ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      console.error('Lecture interrompue', err);
    } finally {
      clock.skipping = this.game.turbo;
      this.playing = false;
    }
  }

  private async one(ev: GameEvent, c: PlayCtx): Promise<void> {
    const g = this.game;
    if (ev.type !== 'cardDealt' && ev.type !== 'handStarted') c.dealing = false;
    g.eventCounts[ev.type] = (g.eventCounts[ev.type] ?? 0) + 1;
    const v = g.view;
    const eng = g.engine;
    switch (ev.type) {
      case 'salonStarted': {
        g.refreshPlaque(c.after);
        if (ev.salon > 1) await announce(`Salon ${ev.salon}`, { y: 300, tone: 'ivoire' });
        break;
      }
      case 'tableStarted': {
        g.refreshPlaque(c.after);
        v.table.peeked = [];
        g.smoke.controls.boss = ev.kind === 'patron' ? 1 : 0;
        void v.score.setTable(0, ev.target, false);
        v.score.clearHand();
        v.score.setFigure(null, null, true);
        const r = eng.getRules(c.after);
        v.gauge.root.style.visibility = '';
        v.gauge.setRules(r.playerLimit, r.dealerStandOn, r.dealerLimit);
        if (ev.kind === 'patron') {
          const boss = eng.content.bosses.find((b) => b.id === ev.bossId);
          sfx.boss();
          if (boss) await v.plaque.bossEntrance(boss.name);
        }
        break;
      }
      case 'handStarted': {
        c.dealing = true;
        v.verdict.hide();
        await v.table.sweep();
        v.gauge.reset();
        v.score.clearHand();
        v.score.setFigure(null, null, true);
        void v.stats.hands.set(ev.handsLeft, true);
        g.syncPiles(c.after, true);
        break;
      }
      case 'cardDealt': {
        // suspense : le croupier marque un temps avant de tirer quand il est à portée de son seuil
        if (ev.to === 'dealer' && !c.dealing) {
          const r = eng.getRules(c.after);
          const cur = v.gauge.dealerTotal;
          if (cur >= r.dealerStandOn - 5) await wait(220);
        }
        // une carte à la fois, toujours : la suivante ne quitte son sabot qu'une fois celle-ci posée
        // (donne initiale : toi, croupier, toi, croupier ; le regard descend, monte, descend, monte)
        if (ev.to === 'player') v.table.shoe.set(Math.max(0, v.table.shoe.n - 1), null);
        else v.table.dealerShoe.set(Math.max(0, v.table.dealerShoe.n - 1), null);
        await v.table.deal(ev.card, ev.to, ev.faceDown);
        // la Jauge suit carte par carte, à l'instant où la carte se pose
        if (ev.to === 'player') v.gauge.setPlayer(ev.total, ev.soft);
        else v.gauge.setDealer(ev.total);
        if (c.dealing) await wait(DEAL_BREATH);
        break;
      }
      case 'playerCardRevealed': {
        await v.table.reveal(ev.card, 'player');
        v.gauge.setPlayer(ev.total, false);
        break;
      }
      case 'holeRevealed': {
        await wait(100);
        await v.table.reveal(ev.card, 'dealer');
        v.table.sprite(ev.card.id)?.root.classList.remove('xray');
        v.gauge.setDealer(ev.total);
        v.gauge.duelOn = true;
        await wait(160);
        break;
      }
      case 'playerBust': {
        v.gauge.setPlayer(ev.total, false);
        v.gauge.setSpectrum(null);
        await wait(140);
        v.gauge.bust(true);
        sfx.thud();
        shakeScreen(12, 240);
        flash(col('bordeaux'), 220, 0.4);
        g.smoke.controls.heat = 1;
        await announce('Crevé', { y: 330, tone: 'cerise', hold: ev.canRecover ? 420 : 620 });
        break;
      }
      case 'bustRecovered': {
        v.gauge.bust(false);
        v.gauge.setPlayer(ev.total, false);
        const a = v.gauge.root;
        pop(a.offsetLeft + v.gauge.xOf(ev.total), a.offsetTop + 150, 'Sauvé', 'plain', true);
        sfx.win();
        await wait(300);
        break;
      }
      case 'cardDiscarded': {
        await v.table.toDiscard(ev.card.id, c.after.table?.discardPile);
        if (ev.owner === 'player') v.gauge.setPlayer(ev.total, false);
        else v.gauge.setDealer(ev.total);
        break;
      }
      case 'cardDestroyed': {
        const sp = v.table.sprite(ev.card.id);
        if (sp) {
          shards(sp.x.value, sp.y.value, col('ivoire'), 16, 70);
          shards(sp.x.value, sp.y.value, col('petrole-glace'), 10, 50);
          pop(sp.x.value, sp.y.value - 100, ev.reason, 'dim');
          sfx.shatter();
          await v.table.destroyCard(ev.card.id);
        } else {
          await this.showcase([ev.card], 'destroy', ev.reason);
        }
        break;
      }
      case 'cardChanged': {
        const sp = v.table.sprite(ev.after.id);
        if (sp) {
          await sp.flip(false, 120);
          v.table.updateCard(ev.after);
          sfx.flip();
          await sp.flip(true, 140);
          sp.bump(0.6);
          v.table.glint(ev.after.id);
        } else {
          await this.showcase([ev.before], 'change', '', [ev.after]);
        }
        break;
      }
      case 'cardAddedToDeck': {
        await this.showcase([ev.card], 'add', 'Dans ton sabot');
        break;
      }
      case 'cardsSwapped': {
        await v.table.swap(ev.playerCard, ev.dealerCard);
        g.updateTotalsFromView(c.after);
        break;
      }
      case 'deckPeeked': {
        if (ev.owner === 'player') v.table.peeked = ev.cards.map((x) => x.id);
        await this.peek(ev.cards, ev.owner);
        if (ev.owner === 'player') v.table.syncPeek(c.after.table?.drawPile ?? []);
        break;
      }
      case 'cardBurned': {
        await this.burn(ev.card, ev.owner);
        break;
      }
      case 'deckReshuffled': {
        await this.reshuffle(ev.owner, ev.count, ev.owner === 'player' ? c.before.table?.discardPile ?? [] : []);
        break;
      }
      case 'dealerStands': {
        v.gauge.setDealer(ev.total);
        pop(POS.dealerHand.x, POS.dealerHand.y + 104, `Le croupier reste à ${ev.total}`, 'dim');
        await wait(280);
        break;
      }
      case 'dealerBust': {
        v.gauge.setDealer(ev.total);
        await wait(160);
        v.gauge.dealerBust(true);
        sfx.thud();
        shakeScreen(10, 220);
        g.smoke.puff(0.6);
        await announce('Il crève', { y: 130, tone: 'ivoire', hold: 520 });
        break;
      }
      case 'outcome': {
        c.outcome = ev.outcome;
        c.dealerBust = ev.dealerBust;
        if (ev.outcome === 'bust') break;
        if (ev.outcome === 'win') sfx.win();
        await v.verdict.stamp({ outcome: ev.outcome, dealerBust: ev.dealerBust }, eng.getRules(c.after));
        await wait(160);
        break;
      }
      case 'scoreStart': {
        const f = eng.content.figures[ev.figure];
        v.score.setFigure(f?.name ?? ev.figure, ev.level, false);
        c.step = 0;
        c.lastMult = ev.mult;
        // les figures notables s'annoncent en gothique ; les mains ordinaires restent sobres
        if (ev.figure !== 'paire' && ev.figure !== 'haute' && ev.figure !== 'petite') {
          sfx.stamp();
          void announce(f?.name ?? ev.figure, { y: 130, tone: 'ivoire', hold: ev.figure === 'blackjack' || ev.figure === 'triple7' ? 600 : 380, size: ev.figure === 'blackjack' || ev.figure === 'triple7' ? 96 : 72 });
        }
        sfx.chip(0);
        const ca = v.score.anchor('chips');
        g.hints.show('score', { x: ca.x - 58, y: ca.y + 20 }, { x: 990, y: 570 }, 262);
        await Promise.all([v.score.chips.set(ev.chips, true, 240), v.score.mult.set(ev.mult, true, 240)]);
        await wait(240);
        break;
      }
      case 'scoreStep': {
        await this.scoreStep(ev, c);
        break;
      }
      case 'scoreEnd': {
        await this.scoreEnd(ev, c);
        break;
      }
      case 'atoutTriggered': {
        const sp = v.items.sprite(ev.uid);
        const a = v.items.anchor(ev.uid);
        sp?.pulse(1.5, 340);
        sp?.shakeIt(0.8);
        if (a) pop(a.x, a.y - 8, ev.text, 'plain');
        sfx.mult(4);
        await wait(360);
        break;
      }
      case 'atoutChanged': {
        v.items.sprite(ev.uid)?.bump(0.5);
        break;
      }
      case 'atoutAdded': {
        v.items.add('atout', ev.uid, ev.defId);
        if (c.after.phase === 'shop') g.hints.show('order', { x: 176, y: 290 }, { x: 24, y: 434 }, 300);
        await wait(240);
        break;
      }
      case 'atoutRemoved': {
        v.items.remove(ev.uid);
        await wait(160);
        break;
      }
      case 'atoutsReordered':
        break;
      case 'consumableAdded': {
        v.items.add('consumable', ev.uid, ev.defId);
        await wait(240);
        break;
      }
      case 'consumableUsed': {
        const sp = v.items.sprite(ev.uid);
        if (sp) {
          sp.z = 950;
          sp.moveTo(640, 360, 0);
          sp.scale.target = 2;
          sfx.whoosh();
          await wait(320);
          await tween(160, (k) => {
            sp.root.style.opacity = String(1 - k);
          }, ease.inCubic);
        }
        v.items.remove(ev.uid);
        break;
      }
      case 'consumableRemoved': {
        v.items.remove(ev.uid);
        break;
      }
      case 'figureLeveled': {
        const f = eng.content.figures[ev.figure];
        const a = v.score.anchor('chips');
        pop(a.x + 60, a.y - 60, `${f?.name ?? ev.figure} niv. ${ev.level}`, 'plain', true);
        sfx.arpeggio();
        await wait(600);
        break;
      }
      case 'rulesChanged': {
        const r = ev.rules ?? eng.getRules(c.after);
        const old = v.gauge.limit.target;
        v.gauge.setRules(r.playerLimit, r.dealerStandOn, r.dealerLimit);
        // le spectre se recalcule tout de suite : les points glissent pendant que la règle s'allonge
        if (c.after.phase === 'playerTurn') v.gauge.setSpectrum(g.spectrumOf(c.after), eng.visibleNextCard(c.after));
        if (old !== r.playerLimit) {
          const gx = v.gauge.root.offsetLeft;
          pop(gx + v.gauge.xOf(r.playerLimit), v.gauge.root.offsetTop + 10, `Limite ${r.playerLimit}`, 'plain', true);
          await wait(Math.min(900, 220 * Math.abs(r.playerLimit - old) + 300));
        }
        break;
      }
      case 'moneyChanged': {
        v.stats.setMoney(ev.total, true);
        if (ev.delta > 0) sfx.coin();
        await wait(160);
        break;
      }
      case 'tableWon': {
        g.lastPayout = { lines: ev.payout, total: ev.total };
        sfx.arpeggio();
        g.smoke.puff(1);
        await announce('Table battue', { y: 340, tone: 'ivoire', hold: 700 });
        break;
      }
      case 'shopEntered':
      case 'shopRerolled':
        break;
      case 'offerBought': {
        g.screens.shop.onBought(ev.offerId);
        break;
      }
      case 'privilegeGained': {
        const p = eng.content.privileges.find((x) => x.id === ev.defId);
        sfx.stamp();
        if (p) await announce(p.name, { y: 300, tone: 'laiton', hold: 500, size: 56 });
        break;
      }
      case 'bossTriggered': {
        v.plaque.flare();
        pop(170, 200, ev.text, 'bad');
        sfx.stamp();
        await wait(420);
        break;
      }
      case 'tableSkipped': {
        const rw = eng.content.skipRewards?.find((x) => x.id === ev.rewardId);
        sfx.coin();
        await announce('Table sautée', { y: 300, tone: 'ivoire', hold: 420 });
        if (rw) pop(640, 380, rw.name, 'plain', true);
        await wait(300);
        break;
      }
      case 'gameOver':
      case 'victory':
        await wait(300);
        break;
      default:
        break;
    }
  }

  private async scoreStep(ev: Extract<GameEvent, { type: 'scoreStep' }>, c: PlayCtx): Promise<void> {
    const v = this.game.view;
    const s = ev.source;
    const step = c.step++;
    let at = v.score.anchor('chips');
    if (s.kind === 'card' || s.kind === 'enhancement') {
      const sp = v.table.sprite(s.cardId);
      if (sp) {
        sp.bump(s.kind === 'card' ? 1 : 0.7);
        at = { x: sp.x.value, y: sp.y.value - 104 };
        if (s.kind === 'enhancement' && (s.enhancement === 'cristal' || s.enhancement === 'doree')) v.table.glint(s.cardId);
        if (s.kind === 'enhancement' && s.enhancement === 'ardente') shards(sp.x.value, sp.y.value + 60, col('braise'), 8, 30);
      }
    } else if (s.kind === 'atout') {
      const sp = v.items.sprite(s.uid);
      const a = v.items.anchor(s.uid);
      sp?.pulse(1.5, 300 + 40);
      sp?.shakeIt(0.8);
      if (a) at = a;
      if (s.cardId !== undefined) v.table.sprite(s.cardId)?.bump(0.4);
    } else if (s.kind === 'boss') {
      v.plaque.shakeIt();
      at = { x: 170, y: 200 };
    } else if (s.kind === 'figure') {
      at = v.score.anchor('chips');
      at.y -= 50;
    } else {
      at = v.score.anchor('mult');
      at.y -= 50;
    }
    const jobs: Promise<void>[] = [];
    // étapes de règle du moteur : le verdict frappe le Mult
    if (s.kind === 'rule' && (s.label === 'Défaite' || s.label === 'Égalité' || s.label === 'Annulée')) {
      if (s.label === 'Défaite') await v.score.breakMult(ev.multAfter);
      else if (s.label === 'Égalité') await v.score.halveMult(ev.multAfter);
      else {
        const a = v.score.anchor('chips');
        pop(a.x + 60, a.y - 50, ev.text || 'Main annulée', 'bad');
        sfx.shatter();
        await Promise.all([v.score.chips.set(ev.chipsAfter, true, 260), v.score.mult.set(ev.multAfter, true, 260)]);
      }
      c.lastMult = ev.multAfter;
      await wait(160);
      return;
    }
    if (ev.xMult) {
      pop(at.x, at.y, ev.text || `×${fmt(ev.xMult)}`, 'xmult', true);
      sfx.xmult(step);
      jobs.push(v.score.mult.set(ev.multAfter, true, 260));
    } else if (ev.mult) {
      pop(at.x, at.y, ev.text || `+${fmt(ev.mult)} Mult`, 'mult');
      sfx.mult(step);
      jobs.push(v.score.mult.set(ev.multAfter, true, 200));
    } else if (ev.chips) {
      pop(at.x, at.y, ev.text || `+${fmt(ev.chips)}`, 'chips');
      sfx.chip(step);
      jobs.push(v.score.chips.set(ev.chipsAfter, true, 200));
    } else if (ev.money) {
      pop(at.x, at.y, ev.text || `+${ev.money} $`, 'money');
      sfx.coin();
    } else if (ev.text) {
      const dead = s.kind === 'boss' || (s.kind === 'card' && !ev.chips && !ev.mult && !ev.xMult);
      pop(at.x, at.y, ev.text, dead ? 'dim' : 'plain');
      if (dead && s.kind === 'card') v.table.sprite(s.cardId)?.shakeIt(0.4);
      sfx.tick();
    }
    if (ev.money) {
      v.stats.setMoney(v.stats.money.value + ev.money, true);
    }
    // valeurs exactes après l'étape
    if (!ev.chips && v.score.chips.value !== ev.chipsAfter) jobs.push(v.score.chips.set(ev.chipsAfter, true, 160));
    if (!ev.mult && !ev.xMult && v.score.mult.value !== ev.multAfter) jobs.push(v.score.mult.set(ev.multAfter, true, 160));
    c.lastMult = ev.multAfter;
    void Promise.all(jobs);
    await wait(Math.max(110, 290 - step * 16));
  }

  private async scoreEnd(ev: Extract<GameEvent, { type: 'scoreEnd' }>, c: PlayCtx): Promise<void> {
    const v = this.game.view;
    const rules = this.game.engine.getRules(c.after);
    if (ev.outcome === 'bust') {
      v.score.setFigure('Crevé', null, false);
      void v.score.chips.set(0, false);
      void v.score.mult.set(0, false);
      await v.verdict.stamp({ outcome: 'bust', dealerBust: false }, rules);
      await v.score.setTable(ev.tableScore, ev.target, true);
      return;
    }
    const verdictP = v.verdict.stamp({ outcome: ev.outcome, dealerBust: c.dealerBust }, rules); // déjà posé à l'issue : sans effet
    await wait(60);
    if (ev.outcome === 'loss' && ev.mult < c.lastMult) {
      await v.score.breakMult(ev.mult);
    } else if (ev.outcome === 'push' && ev.mult < c.lastMult) {
      await v.score.halveMult(ev.mult);
    } else if (v.score.mult.value !== ev.mult) {
      await v.score.mult.set(ev.mult, true, 200);
    }
    if (v.score.chips.value !== ev.chips) await v.score.chips.set(ev.chips, true, 160);
    await verdictP;
    if (ev.outcome === 'loss') {
      const ma = v.score.anchor('mult');
      this.game.hints.show('loss', { x: ma.x + 58, y: ma.y + 20 }, { x: 990, y: 570 }, 262);
    }
    await v.score.merge(ev.handScore);
    if (ev.handScore >= ev.target * 0.5) shakeScreen(6, 200);
    if (ev.handScore >= ev.target) {
      this.game.smoke.blaze(1000);
      shakeScreen(10, 240);
    }
    await wait(160);
    await v.score.fly(ev.tableScore, ev.target);
    if (ev.tableScore >= ev.target && ev.tableScore - ev.handScore < ev.target) {
      sfx.arpeggio();
      this.game.smoke.puff(0.8);
    }
    await wait(100);
  }

  /** Une carte qui n'est pas sur la table (sabot, atelier) vient se montrer puis repart. */
  private async showcase(cards: Card[], mode: 'add' | 'change' | 'destroy', label: string, after?: Card[]): Promise<void> {
    const sprites: Sprite[] = [];
    const n = cards.length;
    cards.forEach((card, i) => {
      const sp = new Sprite({ face: faceOf(card), back: backOf('player'), faceUp: mode !== 'add', parent: this.game.L.fx, size: 2 });
      const from = mode === 'add' ? { x: 640, y: -100 } : POS.playerShoe;
      sp.jump(from.x, from.y, 0);
      sp.moveTo(640 + (i - (n - 1) / 2) * 130, 360, 0);
      sp.z = 900;
      sprites.push(sp);
    });
    sfx.card();
    await Promise.all(sprites.map((s) => s.arrive(500)));
    if (mode === 'add') {
      sfx.flip();
      await Promise.all(sprites.map((s) => s.flip(true, 160)));
    }
    if (mode === 'change' && after) {
      await wait(160);
      for (let i = 0; i < sprites.length; i++) {
        await sprites[i].flip(false, 110);
        sprites[i].setFace(faceOf(after[i]));
        sfx.flip();
        await sprites[i].flip(true, 130);
        sprites[i].bump(0.6);
      }
    }
    if (label) pop(640, 250, label, mode === 'destroy' ? 'bad' : 'plain');
    await wait(mode === 'destroy' ? 280 : 420);
    if (mode === 'destroy') {
      for (const s of sprites) {
        shards(s.x.value, s.y.value, col('ivoire'), 16, 70);
        s.scale.target = 0;
      }
      sfx.shred();
      await wait(240);
    } else {
      sprites.forEach((s) => s.moveTo(POS.playerShoe.x, POS.playerShoe.y, -6));
      await Promise.all(sprites.map((s) => s.flip(false, 160)));
      await Promise.all(sprites.map((s) => s.arrive(500)));
    }
    sprites.forEach((s) => s.destroy());
  }

  private async peek(cards: Card[], owner: 'player' | 'dealer'): Promise<void> {
    const origin = owner === 'player' ? POS.playerShoe : POS.dealerShoe;
    const sprites = cards.map((card, i) => {
      const sp = new Sprite({ face: faceOf(card), back: backOf(owner), faceUp: false, parent: this.game.L.fx, size: 2 });
      sp.jump(origin.x, origin.y, 0);
      const dx = owner === 'player' ? 150 + i * 70 : -150 - i * 70;
      sp.moveTo(origin.x + dx, origin.y - (owner === 'player' ? 150 : -60), (i - 1) * 4);
      sp.z = 900 + i;
      return sp;
    });
    sfx.card();
    await Promise.all(sprites.map((s) => s.arrive(500)));
    sfx.flip();
    await Promise.all(sprites.map((s) => s.flip(true, 180)));
    await wait(1100);
    sprites.forEach((s) => s.moveTo(origin.x, origin.y, 0));
    await Promise.all(sprites.map((s) => s.flip(false, 160)));
    await Promise.all(sprites.map((s) => s.arrive(500)));
    sprites.forEach((s) => s.destroy());
  }

  /** Sabot vide : la défausse repart dans le sabot, cartes retournées, puis on bat. */
  private async reshuffle(owner: 'player' | 'dealer', count: number, pile: Card[]): Promise<void> {
    const v = this.game.view;
    const shoe = owner === 'player' ? POS.playerShoe : POS.dealerShoe;
    const from = owner === 'player' ? POS.playerDiscard : POS.dealerShoe;
    const shown = pile.slice(-Math.min(6, Math.max(1, count)));
    if (owner === 'player') v.table.discard.set([]);
    const sprites = shown.map((card, i) => {
      const sp = new Sprite({ face: faceOf(card), back: backOf(owner), faceUp: true, parent: this.game.L.fx, size: 2 });
      sp.jump(from.x + ((i * 7) % 5) * 2 - 4, from.y - i * 2, ((card.id * 7919) % 17) - 8);
      sp.z = 900 + i;
      return sp;
    });
    sfx.whoosh();
    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i];
      void wait(i * 70).then(() => {
        sfx.card();
        void sp.flip(false, 140);
        sp.moveTo(shoe.x, shoe.y, -6);
      });
    }
    await wait(sprites.length * 70 + 120);
    await Promise.all(sprites.map((s) => s.arrive(500)));
    sprites.forEach((s) => s.destroy());
    // on bat : le sabot tressaute, le compteur remonte
    const root = owner === 'player' ? v.table.shoe.root : v.table.dealerShoe.root;
    root.classList.remove('shuffle');
    void root.offsetWidth;
    root.classList.add('shuffle');
    if (owner === 'player') v.table.shoe.set(v.table.shoe.n + count, null);
    sfx.shred();
    pop(shoe.x, shoe.y - 110, `Remélangé : ${count} cartes`, 'dim');
    await wait(360);
  }

  private async burn(card: Card, owner: 'player' | 'dealer'): Promise<void> {
    const origin = owner === 'player' ? POS.playerShoe : POS.dealerShoe;
    const sp = new Sprite({ face: faceOf(card), back: backOf(owner), faceUp: false, parent: this.game.L.fx, size: 2 });
    sp.jump(origin.x, origin.y, 0);
    sp.moveTo(origin.x + (owner === 'player' ? 140 : -140), origin.y - 40, 0);
    sp.z = 900;
    sfx.card();
    await sp.arrive(400);
    await sp.flip(true, 160);
    await wait(500);
    const t = owner === 'player' ? POS.playerDiscard : POS.dealerShoe;
    sp.moveTo(t.x, t.y, 8);
    await sp.arrive(500);
    sp.destroy();
    this.game.syncPiles(this.game.state!, false);
  }
}

interface PlayCtx {
  before: RunState;
  after: RunState;
  step: number;
  outcome: string | null;
  dealerBust: boolean;
  dealing: boolean;
  /** Animations lancées sans être attendues (donne enchaînée) : on les laisse finir avant de rendre la main. */
  pending: Promise<void>[];
  lastMult: number;
}
