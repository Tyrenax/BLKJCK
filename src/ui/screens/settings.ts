/** Réglages : écran cathodique, fumée, secousses, vitesse, volume. Glisse depuis la droite. */
import { sfx } from '../audio/sfx';
import { settings, updateSettings, type Settings } from '../core/settings';
import { el, place, toStage } from '../core/stage';
import type { Game } from '../game';
import { button, Panel } from './common';

export class SettingsPanel {
  private panel: Panel;
  private body: HTMLElement;
  private confirmAbandon = false;
  constructor(parent: HTMLElement, private game: Game) {
    const root = place(el('div', 'settings f-panel', parent), 860, 14, 404, 690);
    this.panel = new Panel(root, 'right');
    this.body = el('div', 'set-body', root);
  }

  isOpen(): boolean {
    return this.panel.open;
  }

  open(): void {
    this.confirmAbandon = false;
    this.build();
    void this.panel.show();
  }

  close(): void {
    void this.panel.hide();
  }

  private build(): void {
    const b = this.body;
    b.innerHTML = '';
    el('div', 'set-title t-num', b, 'Réglages');
    this.slider(b, 'Écran cathodique', 'crt');
    this.toggle(b, 'Fumée animée', 'bgMotion');
    this.toggle(b, 'Secousses', 'shake');
    this.speed(b);
    this.toggle(b, 'Spectre du tirage', 'spectrum');
    this.toggle(b, 'Enchaîner les mains', 'autoNext');
    this.slider(b, 'Volume', 'volume');
    this.slider(b, 'Musique', 'music');
    this.toggle(b, 'Son coupé', 'muted');
    const foot = el('div', 'set-foot', b);
    button(foot, 'Reprendre', { tone: 'petrole', key: 'Échap', w: 356, x: 0, y: 0 }, () => this.close());
    const half = this.game.state ? 196 : 356;
    button(foot, 'Revoir les indices', { small: true, w: half, x: 0, y: 72, tip: 'Les étiquettes de première partie reviendront.' }, () => {
      this.game.hints.reset();
      sfx.coin();
    });
    if (this.game.state) {
      button(foot, this.confirmAbandon ? 'Vraiment ?' : 'Abandonner', { tone: this.confirmAbandon ? 'bordeaux' : '', small: true, w: 152, x: 204, y: 72, tip: this.confirmAbandon ? 'Clique encore pour abandonner la partie.' : 'Abandonner la partie en cours.' }, () => {
        if (!this.confirmAbandon) {
          this.confirmAbandon = true;
          this.build();
          return;
        }
        this.close();
        this.game.abandon();
      });
    }
  }

  private row(parent: HTMLElement, label: string): HTMLElement {
    const r = el('div', 'set-row', parent);
    el('div', 'set-lab t-num', r, label);
    return r;
  }

  private slider(parent: HTMLElement, label: string, key: 'crt' | 'volume' | 'music'): void {
    const r = this.row(parent, label);
    const track = el('div', 'set-track', r);
    const fill = el('div', 'set-fill', track);
    const knob = el('div', 'set-knob', track);
    const val = el('div', 'set-val t-num', r);
    const paint = () => {
      const v = settings[key];
      fill.style.width = `${v}%`;
      knob.style.left = `${v}%`;
      val.textContent = String(v);
    };
    paint();
    let drag = false;
    const set = (clientX: number, clientY: number) => {
      const p = toStage(clientX, clientY);
      const rect = track.getBoundingClientRect();
      const left = toStage(rect.left, rect.top).x;
      const w = toStage(rect.right, rect.top).x - left;
      const v = Math.round(Math.max(0, Math.min(1, (p.x - left) / w)) * 20) * 5;
      if (v !== settings[key]) {
        updateSettings({ [key]: v } as Partial<Settings>);
        sfx.tick();
        paint();
      }
    };
    track.addEventListener('pointerdown', (e) => {
      drag = true;
      track.setPointerCapture(e.pointerId);
      set(e.clientX, e.clientY);
    });
    track.addEventListener('pointermove', (e) => drag && set(e.clientX, e.clientY));
    track.addEventListener('pointerup', () => {
      drag = false;
      if (key === 'volume') sfx.coin();
    });
  }

  private toggle(parent: HTMLElement, label: string, key: 'bgMotion' | 'shake' | 'muted' | 'spectrum' | 'autoNext'): void {
    const r = this.row(parent, label);
    const t = el('div', 'set-choices', r);
    (['oui', 'non'] as const).forEach((lab) => {
      const on = lab === 'oui' ? settings[key] : !settings[key];
      const b = el('button', `set-choice t-num${on ? ' on' : ''}`, t, lab);
      b.addEventListener('click', () => {
        updateSettings({ [key]: lab === 'oui' } as Partial<Settings>);
        sfx.press();
        this.build();
      });
    });
  }

  private speed(parent: HTMLElement): void {
    const r = this.row(parent, 'Vitesse du jeu');
    const t = el('div', 'set-choices', r);
    ([1, 2, 4] as const).forEach((v) => {
      const b = el('button', `set-choice t-num${settings.speed === v ? ' on' : ''}`, t, `×${v}`);
      b.addEventListener('click', () => {
        updateSettings({ speed: v });
        sfx.press();
        this.build();
      });
    });
  }
}
