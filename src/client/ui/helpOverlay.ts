/**
 * The "Steuerung" (controls) panel. Its content is plain HTML in index.html (#help);
 * this class only shows and hides it.
 */
export class HelpOverlay {
  private readonly root = document.getElementById('help')!;

  constructor() {
    document.getElementById('help-close')!.addEventListener('click', () => this.setVisible(false));
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') this.setVisible(false);
    });
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    if (visible && document.pointerLockElement) document.exitPointerLock();
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }
}
