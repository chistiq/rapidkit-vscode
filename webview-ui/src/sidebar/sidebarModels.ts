/**
 * Model picker state shared by Create and the Agent / Ask / Plan Assistant modes.
 */

export interface SidebarModel {
  id: string;
  name?: string;
  vendor?: string;
}

export function normalizeModels(value: unknown): SidebarModel[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({
      id: String(m.id ?? ''),
      name: typeof m.name === 'string' ? m.name : undefined,
      vendor: typeof m.vendor === 'string' ? m.vendor : undefined,
    }))
    .filter((m) => m.id.length > 0);
}

/** Preferred model is selected unless it is the implicit `auto` sentinel. */
export function resolveSelectedModelId(preferred: unknown): string | null {
  return typeof preferred === 'string' && preferred !== 'auto' && preferred.length > 0
    ? preferred
    : null;
}

export function modelLabel(models: SidebarModel[], selectedId: string | null): string {
  if (!selectedId) {
    return 'Auto';
  }
  const found = models.find((m) => m.id === selectedId);
  return found?.name ?? selectedId;
}
