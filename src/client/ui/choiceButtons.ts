/**
 * A row of buttons of which exactly one is selected (difficulty, game mode). The
 * selected button gets the CSS class `selected`; `data-choice` holds its id so tests
 * and CSS can find it.
 */
export interface Choice<T extends string> {
  id: T;
  label: string;
}

export class ChoiceButtons<T extends string> {
  private readonly buttons: HTMLButtonElement[] = [];

  constructor(
    list: HTMLElement,
    choices: Choice<T>[],
    private selected: T,
    private readonly onPick: (id: T) => void,
    /** Extra data attribute for each button, e.g. "difficulty" -> data-difficulty="leicht". */
    dataName = 'choice',
  ) {
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset[dataName] = choice.id;
      button.dataset.choice = choice.id;
      button.textContent = choice.label;
      button.addEventListener('click', () => this.select(choice.id));
      list.append(button);
      this.buttons.push(button);
    }
    this.markSelected();
  }

  get value(): T {
    return this.selected;
  }

  select(id: T): void {
    this.selected = id;
    this.markSelected();
    this.onPick(id);
  }

  private markSelected(): void {
    for (const button of this.buttons) button.classList.toggle('selected', button.dataset.choice === this.selected);
  }
}
