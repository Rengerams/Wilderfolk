type RendererModule = typeof import('./renderer');

let rendererModule: RendererModule | null = null;

const rendererReady: Promise<RendererModule> = import('./renderer').then((mod) => {
  rendererModule = mod;
  return mod;
});

export function preloadRenderer(): Promise<void> {
  return rendererReady.then(() => undefined);
}

export function resetRendererCaches(): void {
  if (rendererModule) {
    rendererModule.resetRendererCaches();
    return;
  }
  void rendererReady.then((mod) => mod.resetRendererCaches());
}

export function renderGame(
  ...args: Parameters<RendererModule['renderGame']>
): void {
  if (rendererModule) {
    rendererModule.renderGame(...args);
    return;
  }
  void rendererReady.then((mod) => mod.renderGame(...args));
}