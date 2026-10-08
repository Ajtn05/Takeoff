import './style.css';

const app = document.querySelector<HTMLElement>('#app')!;
const page = location.pathname === '/controller' ? import('./controller')
  : location.pathname === '/practice' ? import('./simulator')
  : location.pathname === '/game' ? import('./game') : import('./menu');
page.then((module) => module.mount(app)).catch((error: unknown) => {
  console.error(error); app.innerHTML = '<main class="fatal"><h1>Takeoff could not start</h1><p>This browser needs WebGL 2. Try a current Chrome or Safari browser, then reload.</p><a href="/">Back to menu</a></main>';
});
