/**
 * Lancement d'une partie : le sabot de départ, la mise (les mises verrouillées restent visibles,
 * grisées, avec leur condition de déblocage), une graine facultative.
 */
import type { EmblemArt, StakeDef, StartingDeckDef } from '../../engine/types';
import { sfx } from '../audio/sfx';
import { el, place } from '../core/stage';
import { drawEmblem } from '../gfx/cardArt';
import type { Game, OpenScreenLike } from '../game';
import { button, Panel, refreshButtons } from '../screens/common';
import { backOf } from '../view/table';
import { attachTip, colorize } from '../view/tooltip';
import { isStakeUnlocked } from '../../profile';
import { getProfile } from './profileStore';
import { lab } from './widgets';

const PREF_KEY = 'sabot.launch';
/** Le sabot implicite quand le contenu n'en propose aucun. */
const CLASSIC: StartingDeckDef = {
  id: '',
  name: 'Sabot classique',
  description: '52 cartes, rien de truqué.',
  art: { glyph: '52', pattern: 'rayures', colors: ['prune', 'prune-clair'] } satisfies EmblemArt,
};

interface Prefs {
  deckId?: string;
  stakeId?: string;
}

function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}

function writePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* navigation privée : on oublie le choix, rien de grave */
  }
}

export class LaunchScreen implements OpenScreenLike {
  private panel: Panel;
  private body: HTMLElement;
  private deckId = '';
  private stakeIdx = 0;
  private seedInput: HTMLInputElement | null = null;
  /** Listes affichées (le contenu du jeu, ou une démo pour les captures). */
  decksOverride: StartingDeckDef[] | null = null;
  stakesOverride: StakeDef[] | null = null;

  constructor(parent: HTMLElement, private game: Game) {
    const root = place(el('div', 'x-root f-brass-dark', parent), 140, 30, 1000, 660);
    this.panel = new Panel(root, 'bottom');
    this.body = el('div', 'xl-body', root);
  }

  private decks(): StartingDeckDef[] {
    const d = this.decksOverride ?? this.game.engine.content.startingDecks ?? [];
    return d.length ? d : [CLASSIC];
  }

  private stakes(): StakeDef[] {
    return this.stakesOverride ?? this.game.engine.content.stakes ?? [];
  }

  isOpen(): boolean {
    return this.panel.open;
  }

  open(): void {
    const prefs = readPrefs();
    const decks = this.decks();
    this.deckId = decks.some((d) => d.id === prefs.deckId) ? prefs.deckId! : decks[0].id;
    const si = this.stakes().findIndex((x) => x.id === prefs.stakeId);
    this.stakeIdx = si >= 0 ? si : 0;
    this.clampStake();
    this.render();
    void this.panel.show();
  }

  hide(): void {
    this.seedInput?.blur();
    void this.panel.hide();
  }

  primary(): void {
    if (!this.panel.open || this.why()) return;
    const decks = this.decks();
    const stakes = this.stakes();
    const deck = decks.find((d) => d.id === this.deckId);
    const stake = stakes[this.stakeIdx];
    writePrefs({ deckId: deck?.id || undefined, stakeId: stake?.id });
    const seed = (this.seedInput?.value ?? '').trim();
    this.hide();
    void this.game.newRun(seed, {
      ...(deck && deck.id ? { deckId: deck.id } : {}),
      ...(stake ? { stakeId: stake.id } : {}),
    });
  }

  private why(): string | null {
    if (this.decksOverride || this.stakesOverride) return 'Démonstration : ces sabots ne sont pas dans le jeu.';
    const stake = this.stakes()[this.stakeIdx];
    if (stake && !isStakeUnlocked(getProfile(), this.deckId || undefined, this.stakeIdx)) return 'Cette mise est encore verrouillée.';
    return null;
  }

  /** Une mise verrouillée pour le sabot choisi : on redescend à la plus haute permise. */
  private clampStake(): void {
    const p = getProfile();
    while (this.stakeIdx > 0 && !isStakeUnlocked(p, this.deckId || undefined, this.stakeIdx)) this.stakeIdx--;
  }

  private render(): void {
    const b = this.body;
    b.innerHTML = '';
    const decks = this.decks();
    const stakes = this.stakes();
    const profile = getProfile();
    const head = el('div', 'xl-head', b);
    el('div', 'x-h1 t-num', head, 'Nouvelle partie');
    el('div', 'x-sub t-num', head, stakes.length ? 'Choisis ton sabot, ta mise, et assieds-toi.' : 'Choisis ton sabot et assieds-toi.');
    // la pile (sabot, mise, graine) est centrée entre l'en-tête et les boutons
    // le texte d'une mise peut tenir sur deux lignes (108 + 2 × 23 < 158) ; celui d'un sabot sur une
    const H_DECK = 292;
    const H_STAKE = 158;
    const H_SEED = 90;
    const stack = H_DECK + (stakes.length ? H_STAKE : 0) + H_SEED;
    let y = 84 + Math.max(0, Math.round((556 - 84 - stack) / 2));

    // ── Le sabot ──
    const secD = place(el('div', 'xl-sec', b), 6, y, 980, H_DECK);
    y += H_DECK;
    lab(secD, 'ton sabot');
    const row = el('div', 'xl-decks', secD);
    const step = Math.min(160, Math.floor(960 / Math.max(1, decks.length)));
    const x0 = Math.round((960 - step * decks.length) / 2 + (step - 120) / 2);
    decks.forEach((d, i) => {
      const item = place(el('div', `xl-deck${d.id === this.deckId ? ' on' : ''}`, row), x0 + i * step, 12);
      // un paquet : deux dos décalés de 3 pixels d art (6 unités : assez pour montrer leur liseré Laiton)
      const pack = el('div', 'xl-pack', item);
      for (const off of [12, 6]) {
        const back = backOf('player');
        back.className = 'xl-back';
        back.style.transform = `translate(${off}px, ${off}px)`;
        pack.appendChild(back);
      }
      const cv = drawEmblem(d.art, 'sabot');
      cv.className = 'xl-face';
      pack.appendChild(cv);
      el('div', 'xl-deck-name t-num', item, d.name);
      attachTip(item, () => ({ name: d.name, sub: 'Sabot de départ', body: d.description }));
      item.addEventListener('click', () => {
        if (this.deckId === d.id) return;
        sfx.card();
        this.deckId = d.id;
        this.clampStake();
        this.render();
      });
    });
    const deck = decks.find((d) => d.id === this.deckId) ?? decks[0];
    place(el('div', 'xl-desc t-body', secD), 0, 264, 760).innerHTML = colorize(deck.description);
    const rec = profile.byDeck[deck.id || 'standard'];
    if (rec && rec.played > 0) {
      place(el('div', 'xl-rec t-num', secD, `${rec.played} ${rec.played > 1 ? 'parties' : 'partie'}, ${rec.won} ${rec.won > 1 ? 'gagnées' : 'gagnée'}`), 770, 268, 200).style.textAlign = 'right';
    }

    // ── La mise ──
    if (stakes.length) {
      const secS = place(el('div', 'xl-sec', b), 6, y, 980, H_STAKE);
      // le nom de la mise choisie est dans l'en-tête, sur une ligne ; les plaques portent son chiffre
      // romain (un nom comme « Dernier avertissement » ne tient pas sur une plaque de 113 unités)
      const cur = stakes[this.stakeIdx];
      const head = lab(secS, 'la mise');
      if (cur) el('span', 'xl-stake-cur', head, cur.name);
      const srow = el('div', 'xl-stakes', secS);
      // jusqu'à 150 unités par plaque ; au-delà de six mises, elles rétrécissent
      const sstep = Math.min(162, Math.floor(968 / stakes.length));
      const w = Math.min(150, sstep - 8);
      const sx0 = Math.round((960 - (sstep * (stakes.length - 1) + w)) / 2);
      stakes.forEach((st, i) => {
        const unlocked = isStakeUnlocked(profile, this.deckId || undefined, i);
        const e = place(el('div', `xl-stake${i === this.stakeIdx ? ' on' : ''}${unlocked ? '' : ' locked'}`, srow), sx0 + i * sstep, 0, w);
        el('div', 'xl-stake-num t-num', e, st.art?.glyph || String(i + 1));
        if (unlocked) {
          const pips = el('div', 'xl-pips', e);
          for (let k = 0; k <= i; k++) el('div', 'xl-pip', pips);
        } else el('div', 'xl-lock t-num', e, 'verrouillée');
        const prev = stakes[i - 1];
        attachTip(e, () =>
          unlocked
            ? { name: st.name, sub: i === 0 ? 'Mise de départ' : `Comprend les ${i} mises précédentes`, body: st.description }
            : { name: st.name, why: `Gagne la ${prev?.name ?? 'mise précédente'} avec ce sabot pour la débloquer.` },
        );
        e.addEventListener('click', () => {
          if (!unlocked) {
            sfx.nope();
            return;
          }
          if (i === this.stakeIdx) return;
          sfx.tick();
          this.stakeIdx = i;
          this.render();
        });
      });
      if (cur) place(el('div', 'xl-desc t-body', secS), 0, 108, 960).innerHTML = colorize(cur.description);
      y += H_STAKE;
    }

    // ── La graine ──
    const secG = place(el('div', 'xl-sec', b), 6, y, 980, H_SEED);
    lab(secG, 'graine, si tu veux rejouer une nuit précise');
    const input = place(el('input', 'xl-seed', secG), 0, 28) as HTMLInputElement;
    input.type = 'text';
    input.maxLength = 16;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = 'au hasard';
    if (this.seedInput) input.value = this.seedInput.value;
    // le clavier de la scène (Espace, Échap…) ne doit pas réagir pendant la saisie
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.primary();
      else if (e.key === 'Escape') input.blur();
    });
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^A-Za-z0-9-]/g, '');
      sfx.tick();
    });
    this.seedInput = input;

    // ── Boutons ──
    const why = () => this.why();
    button(b, 'Lancer la partie', { tone: 'petrole', key: 'Espace', w: 330, x: 400, y: 562, why }, () => this.primary());
    button(b, 'Retour', { key: 'Échap', w: 220, x: 744, y: 562 }, () => this.hide());
    refreshButtons(b);
  }
}
