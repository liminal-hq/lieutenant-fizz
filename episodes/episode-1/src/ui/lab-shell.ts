// The Lab button and the switch between the labs: one button opens whichever lab was used last, and each lab's header can jump to the other.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The labs there are. */
export type LabId = 'sound' | 'haptics';

const LABELS: Record<LabId, string> = { sound: 'Sound', haptics: 'Haptics' };
const ORDER: readonly LabId[] = ['sound', 'haptics'];

/** What the shell needs from a lab's panel. */
export interface LabPanel {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

/** What the shell needs from the game. */
export interface LabShellHost {
  /** Adds a node to the overlay layer. */
  mount(node: HTMLElement): void;
  /** Builds a lab (loading its code the first time) and registers its panel with `register`. */
  load(id: LabId): Promise<void>;
}

/**
 * Owns the one Lab button and the Sound | Haptics switch in each lab's header. Each lab is a panel with
 * its own root (`#lab`); only the open one is in the page, so there is one `#lab` at a time and the
 * labs share their layout and styles. A lab's code is loaded the first time it is opened.
 */
export class LabShell {
  readonly button: HTMLButtonElement;
  private readonly panels = new Map<LabId, LabPanel>();
  private readonly switchers = new Set<HTMLElement>();
  private available: readonly LabId[] = [];
  private last: LabId = 'sound';
  private opening = false;

  constructor(private readonly h: LabShellHost) {
    this.button = document.createElement('button');
    this.button.id = 'labBtn';
    this.button.className = 'lf';
    this.button.setAttribute('aria-label', 'Lab');
    this.button.textContent = 'Lab';
    this.button.addEventListener('click', () => void this.toggle());
    this.button.hidden = true;
    h.mount(this.button);
  }

  /** The lab that is open, or null. */
  get openId(): LabId | null {
    for (const [id, p] of this.panels) if (p.isOpen) return id;
    return null;
  }

  /** The labs the player can reach now (the Sound lab and the Haptics lab options, or `?debug` for both). */
  setAvailable(ids: readonly LabId[]): void {
    this.available = ORDER.filter((id) => ids.includes(id));
    if (this.available.length > 0 && !this.available.includes(this.last)) {
      this.last = this.available[0] as LabId;
    }
    this.button.hidden = this.available.length === 0 || this.openId !== null;
    for (const s of this.switchers) this.renderSwitcher(s);
  }

  has(id: LabId): boolean {
    return this.panels.has(id);
  }

  register(id: LabId, panel: LabPanel): void {
    this.panels.set(id, panel);
  }

  unregister(id: LabId): void {
    this.panels.delete(id);
  }

  /** A lab opened: its root goes into the page and the button steps aside. */
  shown(id: LabId, root: HTMLElement): void {
    this.last = id;
    this.h.mount(root);
    this.button.hidden = true;
  }

  /** A lab closed: its root leaves the page and the button comes back if a lab can be reached. */
  hidden(root: HTMLElement): void {
    root.remove();
    this.button.hidden = this.available.length === 0 || this.openId !== null;
  }

  /**
   * The Sound | Haptics switch for a lab's header. It shows only while both labs can be reached, and
   * the lab it sits in is marked as the current one.
   */
  switcher(current: LabId): HTMLElement {
    const row = document.createElement('div');
    row.className = 'lab-row lab-switch';
    row.dataset['current'] = current;
    this.switchers.add(row);
    this.renderSwitcher(row);
    return row;
  }

  /** Forgets a switch whose lab has been taken out of the page. */
  release(row: HTMLElement): void {
    this.switchers.delete(row);
  }

  private renderSwitcher(row: HTMLElement): void {
    row.hidden = this.available.length < 2;
    row.replaceChildren(
      ...this.available.map((id) => {
        const b = document.createElement('button');
        b.textContent = LABELS[id];
        b.setAttribute('aria-pressed', String(id === row.dataset['current']));
        b.addEventListener('click', () => void this.open(id));
        return b;
      }),
    );
  }

  /** Opens a lab (the last one used when none is named), closing the one that is open and loading it if needed. */
  async open(id: LabId = this.last): Promise<void> {
    if (this.opening || !this.available.includes(id)) return;
    this.opening = true;
    try {
      for (const p of this.panels.values()) if (p.isOpen) p.close();
      if (!this.panels.has(id)) await this.h.load(id);
      this.panels.get(id)?.open();
    } finally {
      this.opening = false;
    }
  }

  /** The button: opens the lab, or closes it if one is open. */
  async toggle(): Promise<void> {
    const open = this.openId;
    if (open) this.panels.get(open)?.close();
    else await this.open();
  }

  /** Closes whatever is open and takes the button out of the page. */
  dispose(): void {
    for (const p of this.panels.values()) if (p.isOpen) p.close();
    this.panels.clear();
    this.switchers.clear();
    this.button.remove();
  }
}
