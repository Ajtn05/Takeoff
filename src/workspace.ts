import { setIconButton } from './icons';

export type ViewLayout = 'split' | 'stacked' | 'camera' | 'observer' | 'classic';

type WorkspaceSettings = {
  layout: ViewLayout;
  split: number;
  stackedSplit: number;
  glass: boolean;
  collapsed: boolean;
};

const storageKey = 'trainer-workspace-v1';
const defaults: WorkspaceSettings = { layout: 'split', split: 62, stackedSplit: 50, glass: true, collapsed: false };
const layouts: ViewLayout[] = ['split', 'stacked', 'camera', 'observer', 'classic'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function bindWorkspace(root: HTMLElement): { setFullscreen: (active: boolean) => void } {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const stage = el('stage'), panel = el('flight-panel'), column = el('camera-column'), camera = el('camera-view');
  const divider = el('view-divider'), body = el('flight-panel-body');
  const console = el('flight-console'), actions = root.querySelector<HTMLElement>('.flight-actions')!;
  const status = el('flight-status'), statusHome = status.parentElement!;
  const transport = el('transport-controls'), utility = el('utility-controls');
  const assistance = el('assistance-controls'), assistanceHome = assistance.parentElement!;
  const reset = el('reset'), pause = el('pause'), fullscreenButton = el('simulator-fullscreen');
  const consoleHome = document.createComment('Flight console'); console.before(consoleHome);
  let fullscreen = false, fullscreenCollapsed = true;
  const settings = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<WorkspaceSettings>;
    if (layouts.includes(saved.layout as ViewLayout)) settings.layout = saved.layout!;
    for (const key of ['split', 'stackedSplit'] as const) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) {
        settings[key] = clamp(saved[key], 25, 75);
      }
    }
    if (typeof saved.glass === 'boolean') settings.glass = saved.glass;
    if (typeof saved.collapsed === 'boolean') settings.collapsed = saved.collapsed;
  } catch { /* Defaults also work when browser storage is unavailable. */ }
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Keep the current session usable. */ } };
  const vertical = () => settings.layout === 'stacked' || (settings.layout === 'split' && matchMedia('(max-width: 760px)').matches);
  const ratio = () => vertical() ? settings.stackedSplit : settings.split;
  const docked = () => settings.layout === 'classic' && !fullscreen;
  const fitClassicCamera = () => {
    if (!docked()) { camera.style.removeProperty('width'); return; }
    const height = Math.max(0, column.clientHeight - column.querySelector<HTMLElement>('.camera-title')!.offsetHeight - panel.offsetHeight);
    camera.style.width = `${Math.min(column.clientWidth, height * 16 / 9)}px`;
  };
  const updatePanelSize = () => { root.style.setProperty('--flight-data-height', `${panel.offsetHeight}px`); fitClassicCamera(); };
  const updateRatio = () => {
    stage.style.setProperty('--view-split', `${ratio()}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(ratio())));
    divider.setAttribute('aria-orientation', vertical() ? 'horizontal' : 'vertical');
    divider.setAttribute('aria-valuetext', `Observer ${Math.round(ratio())} percent, camera ${Math.round(100 - ratio())} percent`);
    el('split-value').textContent = `${Math.round(ratio())} / ${Math.round(100 - ratio())}`;
  };
  const apply = () => {
    stage.dataset.layout = settings.layout;
    root.dataset.layout = settings.layout;
    el<HTMLSelectElement>('view-layout').value = settings.layout;
    root.querySelectorAll<HTMLButtonElement>('[data-layout-option]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.layoutOption === settings.layout)));
    panel.classList.toggle('is-glass', settings.glass);
    const collapsed = fullscreen ? fullscreenCollapsed : settings.collapsed;
    panel.classList.toggle('is-collapsed', collapsed);
    body.hidden = collapsed;
    el('panel-collapse').setAttribute('aria-expanded', String(!collapsed));
    setIconButton(el<HTMLButtonElement>('panel-collapse'), collapsed ? 'expand' : 'collapse', collapsed ? 'Expand flight parameters' : 'Collapse flight parameters');
    el('panel-glass').setAttribute('aria-pressed', String(settings.glass));
    setIconButton(el<HTMLButtonElement>('panel-glass'), 'contrast', 'Transparent instrument panel', settings.glass ? 'Glass panel · switch to solid' : 'Solid panel · switch to glass');
    if (docked()) {
      if (panel.parentElement !== column) column.append(panel);
    } else if (panel.parentElement !== stage) stage.append(panel);
    const adjustable = !fullscreen && (settings.layout === 'split' || settings.layout === 'stacked');
    divider.hidden = !adjustable;
    el('split-controls').hidden = !adjustable;
    updateRatio(); updatePanelSize(); save();
  };
  el<HTMLSelectElement>('view-layout').onchange = (event) => { settings.layout = (event.target as HTMLSelectElement).value as ViewLayout; apply(); };
  root.querySelectorAll<HTMLButtonElement>('[data-layout-option]').forEach((button) => {
    button.onclick = () => { settings.layout = button.dataset.layoutOption as ViewLayout; apply(); };
  });
  el('panel-collapse').onclick = () => {
    if (fullscreen) fullscreenCollapsed = !fullscreenCollapsed; else settings.collapsed = !settings.collapsed;
    apply();
  };
  el('panel-glass').onclick = () => { settings.glass = !settings.glass; apply(); };
  el('workspace-reset').onclick = () => { Object.assign(settings, defaults); apply(); };
  el('split-reset').onclick = () => { if (vertical()) settings.stackedSplit = 50; else settings.split = 50; updateRatio(); save(); };
  const setRatio = (value: number) => {
    if (vertical()) settings.stackedSplit = clamp(value, 25, 75); else settings.split = clamp(value, 25, 75);
    updateRatio();
  };
  let resizing: number | undefined;
  const resize = (event: PointerEvent) => {
    const rect = stage.getBoundingClientRect();
    setRatio(vertical() ? (event.clientY - rect.top) / rect.height * 100 : (event.clientX - rect.left) / rect.width * 100);
  };
  divider.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault(); resizing = event.pointerId; divider.setPointerCapture(event.pointerId); root.classList.add('is-resizing'); resize(event);
  };
  divider.onpointermove = (event) => { if (event.pointerId === resizing) resize(event); };
  const finishResize = (event: PointerEvent) => {
    if (event.pointerId !== resizing) return;
    resizing = undefined; root.classList.remove('is-resizing'); save();
  };
  divider.onpointerup = finishResize; divider.onpointercancel = finishResize; divider.onlostpointercapture = finishResize;
  divider.onkeydown = (event) => {
    const decrease = vertical() ? 'ArrowUp' : 'ArrowLeft', increase = vertical() ? 'ArrowDown' : 'ArrowRight';
    if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    setRatio(event.key === 'Home' ? 25 : event.key === 'End' ? 75 : ratio() + (event.key === increase ? 2 : -2)); save();
  };
  new ResizeObserver(() => { updateRatio(); updatePanelSize(); }).observe(stage);
  new ResizeObserver(updatePanelSize).observe(panel);
  new ResizeObserver(fitClassicCamera).observe(column);
  matchMedia('(max-width: 760px)').addEventListener('change', updateRatio);
  apply();
  return { setFullscreen: (active) => {
    if (fullscreen === active) return;
    fullscreen = active;
    document.body.classList.toggle('flight-fullscreen', active);
    if (active) {
      fullscreenCollapsed = true;
      stage.append(console); console.prepend(status);
      actions.prepend(reset, pause); actions.append(fullscreenButton);
      console.append(assistance);
    } else {
      consoleHome.after(console); statusHome.insertBefore(status, el('workspace-reset'));
      transport.append(reset, pause); utility.prepend(fullscreenButton);
      assistanceHome.append(assistance);
    }
    apply();
  } };
}
