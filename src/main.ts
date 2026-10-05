import './style.css';

const app = document.querySelector<HTMLElement>('#app')!;
const page = location.pathname === '/controller' ? import('./controller') : import('./simulator');
page.then((module) => module.mount(app)).catch((error: unknown) => {
  console.error(error); app.innerHTML = '<main class="fatal"><h1>Trainer could not start</h1><p>This browser needs WebGL 2. Try a current Chrome or Safari browser, then reload.</p></main>';
});
