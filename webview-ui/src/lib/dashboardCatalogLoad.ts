/** Host-ack catalog loading — no fake timer-based ready states. */

export type DashboardCatalogLoadState = {
  templatesReady: boolean;
  modulesReady: boolean;
  timedOut: boolean;
};

export function resolveCatalogTemplatesReady(
  acked: boolean,
  exampleCount: number,
  timedOut: boolean
): boolean {
  return acked || exampleCount > 0 || timedOut;
}

export function resolveCatalogModulesReady(
  acked: boolean,
  hasMeta: boolean,
  timedOut: boolean
): boolean {
  return acked || hasMeta || timedOut;
}

export function shouldRequestCatalogRefresh(
  sectionNeedsCatalog: boolean,
  activeView: string
): boolean {
  return activeView === 'dashboard' && sectionNeedsCatalog;
}

export function catalogShowsFallbackBanner(source: string | undefined): boolean {
  return source === 'fallback' || source === 'cache';
}
