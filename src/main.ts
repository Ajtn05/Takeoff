import './styles/base.css';
import { requiredElement } from './ui/dom';

type PageModule = { mount: (app: HTMLElement) => void | Promise<void> };
const pages: Record<string, () => Promise<PageModule>> = {
  '/controller': () => import('./pages/controller'),
  '/practice': () => import('./pages/simulator'),
  '/game': () => import('./pages/game'),
};

const app = requiredElement(document, '#app');
const loadPage = pages[location.pathname] ?? (() => import('./pages/menu'));
loadPage()
  .then((page) => page.mount(app))
  .catch((error: unknown) => {
    console.error(error);
    app.innerHTML =
      '<main class="fatal"><h1>Takeoff could not start</h1><p>This browser needs WebGL 2. Try a current Chrome or Safari browser, then reload.</p><a href="/">Back to menu</a></main>';
  });
