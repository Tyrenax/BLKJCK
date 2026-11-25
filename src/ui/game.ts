/**
 * Le contrôleur : tient l'état de la partie, envoie les actions au moteur, fait jouer les
 * événements, puis aligne tout l'affichage sur le nouvel état (selon la phase).
 */
import type { Action, Card, Engine, NewRunOptions, RunState } from '../engine/types';
import { sfx, unlockAudio } from './audio/sfx';
import { music } from './audio/music';
import type { Smoke } from './bg/smoke';
import { clock, onFrame, shake } from './core/anim';
import { onSettings, settings } from './core/settings';
import type { StageLayers } from './core/stage';
import { EventPlayer } from './player';
import { Carnet } from './screens/carnet';
import { DeckView } from './screens/deck';
import { EndScreen } from './screens/end';
import { IntroScreen } from './screens/intro';
import { ReceiptScreen } from './screens/receipt';
import { SettingsPanel } from './screens/settings';
import { ShopScreen } from './screens/shop';
import { TitleScreen } from './screens/title';
import { ActionBar, type ButtonSpec } from './view/actions';
import { Gauge } from './view/gauge';
import { Plaque, ScorePanel, Stats } from './view/hud';
import { ItemsView } from './view/items';
import { TableView } from './view/table';
import { pop } from './view/fx';
import { Verdict } from './view/verdict';
import { Hints } from './view/hints';
import { GAUGE_X, GAUGE_Y } from './view/gauge';
import { hide as hideTip, initTooltips, refreshTip } from './view/tooltip';

const SAVE_KEY = 'sabot.run';

/** Contrat minimal d'un écran (pour les écrans d'extension, src/ui/ext). */
export interface ScreenLike {
  hide(): void;
  isOpen(): boolean;
  /** Action principale (touche Espace). */
  primary(): void;
}
/** Écran de fin : montré par render() en gameOver / victory. */
export interface EndScreenLike extends ScreenLike {
  show(s: RunState, won: boolean): void;
}
/** Écran ouvert à la demande (lancement de partie, collection). Échap le ferme. */
export interface OpenScreenLike extends ScreenLike {
  open(): void;
}

export interface Targeting {
  uid: number;
  zone: 'playerHand' | 'dealerHand' | 'deck';
  min: number;
  max: number;
  selected: number[];
}

export class Game {
  state: RunState | null = null;
  readonly view: {
    table: TableView;
    gauge: Gauge;
    score: ScorePanel;
    plaque: Plaque;
    stats: Stats;
    items: ItemsView;
    actions: ActionBar;
    verdict: Verdict;
  };
  readonly screens: {
    title: TitleScreen;
    intro: IntroScreen;
    receipt: ReceiptScreen;
    shop: ShopScreen;
    deck: DeckView;
    end: EndScreenLike;
    /** Lancement d'une partie (choix du sabot, de la mise) : fourni par src/ui/ext s'il existe. */
    launch: OpenScreenLike | null;
    collection: OpenScreenLike | null;
    settings: SettingsPanel;
    carnet: Carnet;
  };
  readonly player: EventPlayer;
  busy = false;
  mode: 'normal' | 'discard' | 'target' = 'normal';
  targeting: Targeting | null = null;
  lastPayout: { lines: { label: string; amount: number }[]; total: number } | null = null;
  /** Actions jouées automatiquement (scénarios de démonstration). */
  autoplay: Action[] = [];
  /** Robot de test : saute toutes les animations. */
  turbo = false;
  /** Enchaîner les mains : minuterie en attente avant « Main suivante ». */
  private autoNextTimer: number | null = null;
  /** Sauvegarde automatique (coupée en mode debug pour ne pas écraser la vraie partie). */
  persist = true;
  /** Indices de première partie. */
  readonly hints: Hints;
  /** Compteurs d'événements joués et erreurs rencontrées (robot de test). */
  eventCounts: Record<string, number> = {};
  /** Temps de jeu passé par type d'événement et par action (ms, mesure du rythme). */
  eventTimes: Record<string, number> = {};
  actionTimes: Record<string, number[]> = {};
  errors: string[] = [];
  private tableEl: HTMLElement;

  constructor(readonly L: StageLayers, readonly engine: Engine, readonly smoke: Smoke) {
    this.tableEl = L.table;
    const table = new TableView(L.table, L.cards, () => this.engine, () => this.state);
    table.onCardClick = (id) => this.onTableCard(id);
    this.view = {
      table,
      gauge: new Gauge(L.table),
      score: new ScorePanel(L.table),
      plaque: new Plaque(L.table),
      stats: new Stats(L.table),
      items: new ItemsView(L.table, L.cards, () => this.engine, {
        use: (uid) => this.useConsumable(uid),
        sell: (uid, kind) => void this.act(kind === 'atout' ? { type: 'sellAtout', uid } : { type: 'sellConsumable', uid }),
        reorder: (order) => void this.act({ type: 'reorderAtouts', order }),
        canAct: () => !this.busy && !!this.state,
        why: (kind, uid) => {
          if (!this.state || this.busy) return 'Attends la fin du coup.';
          const a: Action = kind === 'use' ? { type: 'useConsumable', uid } : this.state.atouts.some((x) => x.uid === uid) ? { type: 'sellAtout', uid } : { type: 'sellConsumable', uid };
          return this.engine.whyIllegal(this.state, a);
        },
        sellValue: (uid) => (this.state ? this.engine.sellValue(this.state, uid) : 0),
        inShop: () => this.state?.phase === 'shop',
      }),
      actions: new ActionBar(L.table),
      verdict: new Verdict(L.fx),
    };
    this.view.verdict.avoid = () => this.view.gauge.avoidBoxes();
    this.view.verdict.prefer = () => [this.view.gauge.rulerBox()];
    this.view.table.shoe.root.addEventListener('click', () => this.openDeck());
    this.view.score.root.addEventListener('click', () => this.state && this.screens.carnet.toggle());
    this.view.score.root.classList.add('clickable');
    this.view.table.discard.root.addEventListener('click', () => this.openDeck());
    this.screens = {
      title: new TitleScreen(L.screens, this),
      intro: new IntroScreen(L.screens, this),
      receipt: new ReceiptScreen(L.screens, this),
      shop: new ShopScreen(L.screens, this),
      deck: new DeckView(L.top, this),
      end: new EndScreen(L.screens, this),
      launch: null,
      collection: null,
      settings: new SettingsPanel(L.top, this),
      carnet: new Carnet(L.top, this),
    };
    this.player = new EventPlayer(this);
    this.hints = new Hints(L.fx, L.table);
    initTooltips(L.tooltip, L.stage);

    onSettings((s) => {
      clock.speed = s.speed;
      shake.enabled = s.shake;
      smoke.controls.motion = s.bgMotion;
      smoke.controls.aberration = s.crt / 100;
      L.crt.style.setProperty('--crt', String((s.crt / 100) * 0.9));
      smoke.markDirty();
      this.view.gauge.setSpectrumEnabled(s.spectrum);
      if (this.state && !this.busy) this.updateSpectrum(this.state);
    });

    onFrame(() => {
      const inTable = !!this.state?.table?.hand;
      smoke.controls.heat = inTable ? this.view.gauge.heat() : 0;
      music.setTension(this.state?.table?.kind === 'patron' && this.state.phase !== 'shop' ? 1 : 0);
    });

    this.bindInput();
    this.showTable(false);
  }

  // ───────────── Partie ─────────────

  hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return !!raw && !!this.engine.deserialize(raw);
    } catch {
      return false;
    }
  }

  save(): void {
    if (!this.state || !this.persist) return;
    try {
      if (this.state.phase === 'gameOver' || this.state.phase === 'victory') localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, this.engine.serialize(this.state));
    } catch {
      /* stockage plein ou bloqué : la partie continue sans sauvegarde */
    }
  }

  /** Lance une partie (appelé par l'écran titre ou l'écran de lancement). */
  async newRun(seed?: string, options?: NewRunOptions): Promise<void> {
    for (const k of ['launch', 'collection'] as const) this.screens[k]?.hide();
    const res = this.engine.newRun(seed || Math.random().toString(36).slice(2, 10), options);
    this.screens.title.hide();
    const before = res.state;
    this.state = res.state;
    this.save();
    this.showTable(true);
    this.syncAll(res.state, true);
    this.busy = true;
    this.renderControls();
    await this.player.play(res.events, before, res.state);
    this.busy = false;
    this.render();
  }

  /** Affiche directement un état (reprise, tests). */
  load(s: RunState): void {
    this.state = s;
    this.screens.title.hide();
    this.showTable(true);
    this.syncAll(s, true);
    this.render();
  }

  resume(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const s = raw ? this.engine.deserialize(raw) : null;
      if (!s) return false;
      this.state = s;
      this.screens.title.hide();
      this.showTable(true);
      this.syncAll(s, true);
      this.render();
      return true;
    } catch {
      return false;
    }
  }

  toTitle(): void {
    this.state = null;
    this.mode = 'normal';
    this.targeting = null;
    this.showTable(false);
    for (const k of ['intro', 'receipt', 'shop', 'end'] as const) this.screens[k].hide();
    this.screens.deck.hide();
    this.screens.carnet.hide();
    this.view.table.sync({ ...(this.engine.newRun('x').state), table: null } as RunState);
    this.view.items.sync({ atouts: [], consumables: [] } as unknown as RunState);
    this.screens.title.show();
  }

  abandon(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* rien */
    }
    this.toTitle();
  }

  /** Envoie une action au moteur, joue les événements, puis réaligne l'affichage. */
  async act(action: Action): Promise<boolean> {
    unlockAudio();
    const s = this.state;
    if (!s || this.busy) return false;
    this.hints.dismiss();
    this.cancelAutoNext();
    const why = this.engine.whyIllegal(s, action);
    if (why) {
      sfx.nope();
      pop(640, 600, why, 'bad');
      return false;
    }
    let res;
    try {
      res = this.engine.dispatch(s, action);
    } catch (err) {
      sfx.nope();
      pop(640, 600, err instanceof Error ? err.message : 'Action impossible.', 'bad');
      return false;
    }
    this.state = res.state;
    this.save();
    this.busy = true;
    this.mode = 'normal';
    this.targeting = null;
    this.view.table.selected.clear();
    this.view.table.setSelectable(null);
    this.view.items.select(null);
    hideTip();
    this.renderControls();
    this.prePlay(s, res.state, action);
    const t0 = clock.now;
    await this.player.play(res.events, s, res.state);
    (this.actionTimes[action.type] ??= []).push(clock.now - t0);
    this.busy = false;
    this.render();
    void this.runAutoplay();
    return true;
  }

  private async runAutoplay(): Promise<void> {
    const next = this.autoplay.shift();
    if (!next || !this.state) return;
    await new Promise((r) => setTimeout(r, 500 / clock.speed));
    await this.act(next);
  }

  /** Préparatifs visuels avant de jouer certains événements (changement d'écran). */
  private prePlay(before: RunState, after: RunState, action: Action): void {
    if (action.type === 'stand' || action.type === 'double' || action.type === 'acceptBust') this.view.gauge.setSpectrum(null);
    if (action.type === 'nextHand') this.view.verdict.hide();
    if (action.type === 'startTable' || action.type === 'skipTable') this.screens.intro.hide();
    if (action.type === 'cashOut') this.screens.receipt.hide();
    if (action.type === 'leaveShop') this.screens.shop.hide();
    void before;
    void after;
  }

  // ───────────── Affichage ─────────────

  showTable(on: boolean): void {
    this.tableEl.style.visibility = on ? '' : 'hidden';
    this.view.items.setVisible(on);
    this.smoke.controls.felt = true;
    this.smoke.markDirty();
  }

  refreshPlaque(s: RunState): void {
    const t = s.table;
    const kind = t?.kind ?? (['petite', 'grande', 'patron'] as const)[s.tableIndex] ?? 'petite';
    const boss = this.engine.content.bosses.find((b) => b.id === s.bossId) ?? null;
    this.view.plaque.set({
      salon: s.salon,
      tableIndex: s.tableIndex,
      kind,
      target: t?.target ?? null,
      reward: this.engine.content.balance.tableRewards[kind],
      boss,
      shop: s.phase === 'shop',
    });
  }

  syncPiles(s: RunState, _animate: boolean): void {
    const t = s.table;
    const live = !!t && (t.drawPile.length > 0 || !!t.hand);
    this.view.table.shoe.set(live ? t!.drawPile.length : s.deck.length, live ? this.engine.visibleNextCard(s) : null);
    this.view.table.discard.set(t?.discardPile ?? []);
  }

  /** Totaux recalculés depuis les cartes à l'écran (après un échange). */
  updateTotalsFromView(s: RunState): void {
    const r = this.engine.getRules(s);
    const pc = this.view.table.playerIds.map((id) => this.view.table.entries.get(id)!.card);
    const dc = this.view.table.dealerIds.filter((id) => !this.view.table.entries.get(id)!.faceDown).map((id) => this.view.table.entries.get(id)!.card);
    const pv = this.engine.handValue(pc, r.playerLimit);
    this.view.gauge.setPlayer(pv.total, pv.soft);
    this.view.gauge.setDealer(this.engine.handValue(dc, r.dealerLimit).total);
  }

  /** Spectre du prochain tirage : où t'amènerait chaque carte restante de ton sabot. */
  spectrumOf(s: RunState): { card: Card; total: number }[] | null {
    const t = s.table;
    const h = t?.hand;
    if (!t || !h || s.phase !== 'playerTurn' || !t.drawPile.length) return null;
    if ((h.hiddenCardIds ?? []).length) return null;
    const r = this.engine.getRules(s);
    return t.drawPile.map((card) => ({ card, total: this.engine.handValue([...h.playerCards, card], r.playerLimit).total }));
  }

  updateSpectrum(s: RunState): void {
    const e = this.busy ? null : this.spectrumOf(s);
    this.view.gauge.setSpectrum(e, e ? this.engine.visibleNextCard(s) : null);
  }

  /** Aligne tout l'affichage persistant sur l'état. */
  syncAll(s: RunState, instant: boolean): void {
    const eng = this.engine;
    const v = this.view;
    const t = s.table;
    this.refreshPlaque(s);
    const r = eng.getRules(s);
    v.gauge.setMaxLimit((eng.content.balance as { maxPlayerLimit?: number }).maxPlayerLimit ?? null);
    v.gauge.baseDealerLimit = eng.content.balance.baseRules.dealerLimit;
    // la Jauge ne se montre qu'à table ; elle s'allonge / se rogne sous les yeux du joueur
    const gaugeOn = !!t?.hand || s.phase === 'playerTurn' || s.phase === 'bustChoice' || s.phase === 'handResult';
    v.gauge.root.style.visibility = gaugeOn ? '' : 'hidden';
    if (gaugeOn || instant) v.gauge.setRules(r.playerLimit, r.dealerStandOn, r.dealerLimit, instant && !gaugeOn);
    v.table.sync(s);
    v.items.sync(s);
    v.stats.setMoney(s.money, false);
    void v.stats.hands.set(t?.handsLeft ?? r.handsPerTable, false);
    void v.stats.discards.set(t?.discardsLeft ?? r.discardsPerTable, false);
    this.smoke.controls.boss = t?.kind === 'patron' ? 1 : 0;
    const h = t?.hand ?? null;
    if (h) {
      const hidden = new Set(h.hiddenCardIds ?? []);
      const pv = eng.handValue(h.playerCards.filter((c) => !hidden.has(c.id)), r.playerLimit);
      const realPv = eng.handValue(h.playerCards, r.playerLimit);
      const dVisible = h.holeRevealed || r.seeDealerHole ? h.dealerCards : h.dealerCards.slice(0, 1);
      v.gauge.setPlayer(pv.total, pv.soft, h.playerCards.length > 0);
      v.gauge.setDealer(eng.handValue(dVisible, r.dealerLimit).total, h.dealerCards.length > 0);
      const busted = s.phase === 'bustChoice' || h.result?.outcome === 'bust' || realPv.total > r.playerLimit;
      if (busted !== v.gauge.busted) v.gauge.bust(busted);
      const dBust = !!h.result?.dealerBust;
      if (dBust !== v.gauge.dealerBusted) v.gauge.dealerBust(dBust);
      v.gauge.duelOn = s.phase === 'handResult' && !!h.holeRevealed;
      if (s.phase === 'handResult' && h.result) void v.verdict.stamp(h.result, r, false);
      else v.verdict.hide();
    } else {
      v.gauge.reset();
      v.verdict.hide();
    }
    this.updateSpectrum(s);
    // compteur
    void v.score.setTable(t?.score ?? 0, t?.target ?? 0, false);
    if (h && (s.phase === 'playerTurn' || s.phase === 'bustChoice')) {
      const p = eng.previewFigure(s);
      if (p) {
        v.score.setFigure(eng.content.figures[p.figure]?.name ?? p.figure, p.level, true);
        void v.score.chips.set(p.chips, false);
        void v.score.mult.set(p.mult, false);
      } else {
        v.score.clearHand();
        v.score.setFigure(null, null, true);
      }
    } else if (h?.result && instant) {
      const res = h.result;
      v.score.setFigure(res.outcome === 'bust' ? 'Crevé' : eng.content.figures[res.figure]?.name ?? res.figure, null, false);
      void v.score.chips.set(res.chips, false);
      void v.score.mult.set(res.mult, false);
    } else if (!h) {
      v.score.clearHand();
      v.score.setFigure(null, null, true);
    }
  }

  /** Affichage complet après une action : persistant + écran de la phase + boutons. */
  render(): void {
    const s = this.state;
    if (!s) return;
    this.syncAll(s, false);
    const ph = s.phase;
    if (ph === 'tableIntro') this.screens.intro.show(s);
    else this.screens.intro.hide();
    if (ph === 'tableWon') this.screens.receipt.show(s, this.lastPayout);
    else this.screens.receipt.hide();
    if (ph === 'shop') this.screens.shop.show(s);
    else this.screens.shop.hide();
    if (ph === 'gameOver' || ph === 'victory') this.screens.end.show(s, ph === 'victory');
    else this.screens.end.hide();
    if (this.screens.deck.isOpen()) this.screens.deck.refresh();
    this.screens.carnet.refresh();
    this.renderControls();
    refreshTip();
    this.maybeHint(s);
    this.scheduleAutoNext(s);
  }

  /** Réglage « Enchaîner les mains » : la main suivante part seule 1,2 s après le verdict. */
  private scheduleAutoNext(s: RunState): void {
    this.cancelAutoNext();
    const t = s.table;
    if (!settings.autoNext || s.phase !== 'handResult' || !t || this.turbo) return;
    const won = t.score >= t.target;
    const lost = t.handsLeft <= 0 && !won;
    if (won || lost) return; // une table gagnée ou perdue mérite qu'on s'y arrête
    this.autoNextTimer = window.setTimeout(() => {
      this.autoNextTimer = null;
      if (this.overlayOpen() || this.state?.phase !== 'handResult') return;
      void this.act({ type: 'nextHand' });
    }, 1200 / clock.speed);
  }

  cancelAutoNext(): void {
    if (this.autoNextTimer !== null) window.clearTimeout(this.autoNextTimer);
    this.autoNextTimer = null;
  }

  /** Un panneau recouvre la table (on ne joue rien tout seul pendant ce temps). */
  overlayOpen(): boolean {
    const sc = this.screens;
    return sc.carnet.isOpen() || sc.deck.isOpen() || sc.settings.isOpen();
  }

  /** Indices de première partie, au bon moment. */
  private maybeHint(s: RunState): void {
    const h = s.table?.hand;
    if (s.phase !== 'playerTurn' || !h) return;
    if (!this.hints.has('gauge')) {
      this.hints.show('gauge', { x: GAUGE_X + 420, y: GAUGE_Y + 116 }, { x: 990, y: 566 }, 262);
      return;
    }
    const r = this.engine.getRules(s);
    const total = this.engine.handValue(h.playerCards, r.playerLimit).total;
    const lim = r.playerLimit;
    if (total >= lim - 9 && total <= lim - 5 && this.engine.legalActions(s).includes('discard') && h.playerCards.length >= 2) {
      this.hints.show('discard', { x: 880, y: 640 }, { x: 990, y: 570 }, 262);
    }
  }

  /** Boutons de la barre d'actions selon la phase et le mode. */
  renderControls(): void {
    const s = this.state;
    const a = this.view.actions;
    a.root.classList.toggle('busy', this.busy);
    if (!s) return a.clear();
    if (this.busy) {
      a.setHint('espace pour passer');
      return;
    }
    const why = (act: Action) => this.engine.whyIllegal(s, act);
    const legal = this.engine.legalActions(s);
    const btn = (id: string, label: string, act: Action, o: Partial<ButtonSpec> = {}): ButtonSpec => ({
      id,
      label,
      why: legal.includes(act.type) ? why(act) : why(act) ?? 'Pas maintenant.',
      run: () => void this.act(act),
      ...o,
    });
    if (this.mode === 'discard') {
      a.set([{ id: 'cancel', label: 'Annuler', key: 'Échap', run: () => this.cancelMode() }], 'Choisis la carte à défausser');
      return;
    }
    if (this.mode === 'target' && this.targeting) {
      const tg = this.targeting;
      const d = this.view.items.consDef(this.view.items.consInstance(tg.uid)?.defId ?? '');
      const n = tg.selected.length;
      const okWhy = n < tg.min ? `Choisis encore ${tg.min - n} carte${tg.min - n > 1 ? 's' : ''}.` : null;
      a.set(
        [
          { id: 'confirm', label: `Valider ${n}/${tg.max}`, key: 'Espace', tone: 'petrole', width: 180, why: okWhy, run: () => this.confirmTarget() },
          { id: 'cancel', label: 'Annuler', key: 'Échap', run: () => this.cancelMode() },
        ],
        `${d?.name ?? 'Combine'} : choisis ${tg.min === tg.max ? tg.min : `${tg.min} à ${tg.max}`} carte${tg.max > 1 ? 's' : ''}`,
      );
      return;
    }
    switch (s.phase) {
      case 'playerTurn': {
        const firstId = s.table?.hand?.playerCards[0]?.id ?? -1;
        const discardWhy = legal.includes('discard') ? null : why({ type: 'discard', cardId: firstId }) ?? 'Pas maintenant.';
        a.set([
          btn('hit', 'Tirer', { type: 'hit' }, { key: 'T', tone: 'petrole', width: 132 }),
          btn('stand', 'Rester', { type: 'stand' }, { key: 'R', tone: 'bordeaux', width: 140 }),
          btn('double', 'Doubler', { type: 'double' }, { key: 'D', tip: 'Une seule carte de plus, puis tu restes. Ton Mult ×2.' }),
          { id: 'discard', label: 'Défausser', key: 'F', width: 168, why: discardWhy, tip: 'Retire une carte de ta main, sans la remplacer.', run: () => this.enterDiscard() },
        ]);
        break;
      }
      case 'bustChoice': {
        const firstId = s.table?.hand?.playerCards[0]?.id ?? -1;
        const discardWhy = legal.includes('discard') ? null : why({ type: 'discard', cardId: firstId }) ?? 'Pas maintenant.';
        a.set(
          [
            btn('accept', 'Accepter', { type: 'acceptBust' }, { key: 'Espace', tone: 'bordeaux', width: 196, tip: 'La main marque 0.' }),
            { id: 'discard', label: 'Défausser', key: 'F', width: 168, why: discardWhy, run: () => this.enterDiscard() },
          ],
          'Défausse une carte ou joue une combine pour te sauver',
        );
        break;
      }
      case 'handResult':
        a.set([btn('next', 'Main suivante', { type: 'nextHand' }, { key: 'Espace', tone: 'ivory', width: 250 })]);
        break;
      default:
        a.clear();
    }
  }

  // ───────────── Modes : défausse et ciblage ─────────────

  enterDiscard(): void {
    if (!this.state || this.busy) return;
    this.mode = 'discard';
    this.view.items.select(null);
    this.view.table.selected.clear();
    this.view.table.setSelectable('player');
    this.renderControls();
  }

  cancelMode(): void {
    this.mode = 'normal';
    this.targeting = null;
    this.view.table.selected.clear();
    this.view.table.setSelectable(null);
    this.screens.deck.hide();
    this.renderControls();
  }

  private onTableCard(id: number): void {
    if (this.busy) return;
    if (this.mode === 'discard') {
      void this.act({ type: 'discard', cardId: id });
      return;
    }
    if (this.mode === 'target' && this.targeting) this.toggleTarget(id);
  }

  toggleTarget(id: number): void {
    const tg = this.targeting;
    if (!tg) return;
    const i = tg.selected.indexOf(id);
    if (i >= 0) tg.selected.splice(i, 1);
    else {
      if (tg.selected.length >= tg.max) tg.selected.shift();
      tg.selected.push(id);
    }
    sfx.tick();
    this.view.table.selected = new Set(tg.selected);
    this.view.table.setSelectable(tg.zone === 'dealerHand' ? 'dealer' : tg.zone === 'playerHand' ? 'player' : null);
    if (tg.zone === 'deck') this.screens.deck.refresh();
    this.renderControls();
  }

  confirmTarget(): void {
    const tg = this.targeting;
    if (!tg || tg.selected.length < tg.min) return;
    this.screens.deck.hide();
    void this.act({ type: 'useConsumable', uid: tg.uid, targets: [...tg.selected] });
  }

  useConsumable(uid: number): void {
    const s = this.state;
    if (!s || this.busy) return;
    const inst = s.consumables.find((c) => c.uid === uid);
    const def = inst ? this.engine.content.consumables.find((c) => c.id === inst.defId) : undefined;
    if (!def) return;
    const why = this.engine.whyIllegal(s, { type: 'useConsumable', uid });
    if (why) {
      sfx.nope();
      pop(640, 600, why, 'bad');
      return;
    }
    if (!def.targeting) {
      void this.act({ type: 'useConsumable', uid });
      return;
    }
    this.mode = 'target';
    this.targeting = { uid, zone: def.targeting.zone, min: def.targeting.min, max: def.targeting.max, selected: [] };
    this.view.table.selected.clear();
    if (def.targeting.zone === 'deck') this.screens.deck.open('select');
    else this.view.table.setSelectable(def.targeting.zone === 'dealerHand' ? 'dealer' : 'player');
    this.renderControls();
  }

  openDeck(): void {
    if (!this.state) return;
    sfx.whoosh();
    this.screens.deck.open('view');
  }

  // ───────────── Clavier ─────────────

  private bindInput(): void {
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    // enchaîner les mains : un clic sur le tapis pendant l'attente passe tout de suite
    this.L.world.addEventListener('pointerdown', (e) => {
      if (this.autoNextTimer === null) return;
      const t = e.target as HTMLElement;
      if (t.closest('.btn, .item, .score, .shoe, .discard, .plaque, .gauge, .stats')) return;
      this.cancelAutoNext();
      void this.act({ type: 'nextHand' });
    });
    window.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
    window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => {
      unlockAudio();
      if (e.repeat) return;
      // un champ de saisie (graine…) garde ses touches pour lui
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'pageup', 'pagedown', 'home', 'end', 'tab'].includes(k)) e.preventDefault();
      if (k === 'escape') {
        if (this.screens.settings.isOpen()) this.screens.settings.close();
        else if (this.screens.carnet.isOpen()) this.screens.carnet.hide();
        else if (this.screens.launch?.isOpen()) this.screens.launch.hide();
        else if (this.screens.collection?.isOpen()) this.screens.collection.hide();
        else if (this.screens.deck.isOpen()) {
          if (this.mode === 'target') this.cancelMode();
          else this.screens.deck.hide();
        } else if (this.mode !== 'normal') this.cancelMode();
        else this.screens.settings.open();
        return;
      }
      if (this.screens.settings.isOpen()) return;
      if (k === 'c' && this.state && !this.screens.title.isOpen()) {
        this.screens.carnet.toggle();
        return;
      }
      if (this.screens.carnet.isOpen()) {
        if (k === ' ') this.screens.carnet.hide();
        return;
      }
      if (k === ' ') {
        if (this.player.playing) {
          this.player.skip();
          return;
        }
        if (this.screens.launch?.isOpen()) {
          this.screens.launch.primary();
          return;
        }
        if (this.screens.collection?.isOpen()) {
          this.screens.collection.primary();
          return;
        }
        if (this.screens.title.isOpen()) {
          this.screens.title.primary();
          return;
        }
        if (this.screens.deck.isOpen() && this.mode !== 'target') {
          this.screens.deck.hide();
          return;
        }
        if (this.mode === 'target') {
          this.view.actions.trigger('confirm');
          return;
        }
        const ph = this.state?.phase;
        if (ph === 'tableIntro') this.screens.intro.primary();
        else if (ph === 'handResult') this.view.actions.trigger('next');
        else if (ph === 'bustChoice') this.view.actions.trigger('accept');
        else if (ph === 'tableWon') this.screens.receipt.primary();
        else if (ph === 'shop') this.screens.shop.primary();
        else if (ph === 'gameOver' || ph === 'victory') this.screens.end.primary();
        return;
      }
      if (this.busy || !this.state) return;
      if (this.state.phase === 'playerTurn' && this.mode === 'normal') {
        if (k === 't') this.view.actions.trigger('hit');
        if (k === 'r') this.view.actions.trigger('stand');
        if (k === 'd') this.view.actions.trigger('double');
        if (k === 'f') this.view.actions.trigger('discard');
      }
      if (this.state.phase === 'bustChoice' && k === 'f') this.view.actions.trigger('discard');
      if (k === 's') this.openDeck();
    });
  }
}
