import { setIconButton } from './icons';

export type ViewLayout = 'split' | 'stacked' | 'camera' | 'observer' | 'classic';

type WorkspaceSettings = {
  layout: ViewLayout;
  split: number;
  stackedSplit: number;
  glass: boolean;
  collapsed: boolean;
  panelX: number;
  panelY: number;
};

const storageKey = 'trainer-workspace-v1';
const defaults: WorkspaceSettings = { layout: 'split', split: 62, stackedSplit: 50, glass: true, collapsed: false, panelX: 0, panelY: 1 };
const layouts: ViewLayout[] = ['split', 'stacked', 'camera', 'observer', 'classic'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function bindWorkspace(root: HTMLElement): { setFullscreen: (active: boolean) => void } {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const stage = el('stage'), panel = el('flight-panel'), column = el('camera-column'), camera = el('camera-view');
  const divider = el('view-divider'), handle = el<HTMLButtonElement>('panel-handle'), body = el('flight-panel-body');
  const console = el('flight-console'), actions = root.querySelector<HTMLElement>('.flight-actions')!;
  const status = el('flight-status'), statusHome = status.parentElement!;
  const transport = el('transport-controls'), utility = el('utility-controls');
  const reset = el('reset'), pause = el('pause'), fullscreenButton = el('simulator-fullscreen');
  const consoleHome = document.createComment('Flight console'); console.before(consoleHome);
  let fullscreen = false, fullscreenCollapsed = true;
  const settings = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<WorkspaceSettings>;
    if (layouts.includes(saved.layout as ViewLayout)) settings.layout = saved.layout!;
    for (const key of ['split', 'stackedSplit', 'panelX', 'panelY'] as const) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) {
        settings[key] = clamp(saved[key], key.endsWith('Split') || key === 'split' ? 25 : 0, key.endsWith('Split') || key === 'split' ? 75 : 1);
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
  const panelSpace = () => ({
    x: Math.max(0, stage.clientWidth - panel.offsetWidth - 28),
    y: Math.max(0, stage.clientHeight - panel.offsetHeight - 14 - (fullscreen ? console.offsetHeight + 28 : 44)),
  });
  const positionPanel = () => {
    if (docked()) return;
    const inset = 14, { x: availableX, y: availableY } = panelSpace();
    panel.style.left = `${inset + availableX * settings.panelX}px`;
    panel.style.top = `${inset + availableY * settings.panelY}px`;
  };
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
    handle.disabled = docked();
    handle.setAttribute('aria-label', docked() ? 'Flight parameters docked in Classic layout' : 'Move flight parameters. Drag or use arrow keys.');
    if (docked()) {
      if (panel.parentElement !== column) column.append(panel);
      panel.style.removeProperty('left'); panel.style.removeProperty('top');
    } else if (panel.parentElement !== stage) stage.append(panel);
    const adjustable = !fullscreen && (settings.layout === 'split' || settings.layout === 'stacked');
    divider.hidden = !adjustable;
    el('split-controls').hidden = !adjustable;
    updateRatio(); positionPanel(); fitClassicCamera(); save();
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
  let dragging: { id: number; x: number; y: number; left: number; top: number } | undefined;
  handle.onpointerdown = (event) => {
    if (event.button !== 0 || docked()) return;
    event.preventDefault(); handle.focus();
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
    handle.setPointerCapture(event.pointerId); panel.classList.add('is-dragging');
  };
  handle.onpointermove = (event) => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const space = panelSpace();
    settings.panelX = clamp((dragging.left + event.clientX - dragging.x - 14) / Math.max(1, space.x), 0, 1);
    settings.panelY = clamp((dragging.top + event.clientY - dragging.y - 14) / Math.max(1, space.y), 0, 1);
    positionPanel();
  };
  const finishDrag = (event: PointerEvent) => { if (event.pointerId === dragging?.id) { dragging = undefined; panel.classList.remove('is-dragging'); save(); } };
  handle.onpointerup = finishDrag; handle.onpointercancel = finishDrag; handle.onlostpointercapture = finishDrag;
  handle.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key) || docked()) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Home') { settings.panelX = 0; settings.panelY = 1; }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') settings.panelX = clamp(settings.panelX + (event.key === 'ArrowRight' ? 0.05 : -0.05), 0, 1);
    else settings.panelY = clamp(settings.panelY + (event.key === 'ArrowDown' ? 0.05 : -0.05), 0, 1);
    positionPanel(); save();
  };
  new ResizeObserver(() => { updateRatio(); positionPanel(); fitClassicCamera(); }).observe(stage);
  new ResizeObserver(() => { positionPanel(); fitClassicCamera(); }).observe(panel);
  new ResizeObserver(fitClassicCamera).observe(column);
  new ResizeObserver(positionPanel).observe(console);
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
    } else {
      consoleHome.after(console); statusHome.insertBefore(status, el('workspace-reset'));
      transport.append(reset, pause); utility.prepend(fullscreenButton);
    }
    apply();
  } };
}
