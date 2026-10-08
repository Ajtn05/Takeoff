import { menuMarkup } from '../ui/templates/menu';
import { readBestScore } from '../game/scores';
import '../styles/game.css';

export function mount(app: HTMLElement): void {
  document.title = 'Takeoff · Choose your flight';
  app.innerHTML = menuMarkup(readBestScore());
}
