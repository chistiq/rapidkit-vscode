type ModuleExplorerReload = () => Promise<void>;

let reloadModuleStates: ModuleExplorerReload | null = null;

export function registerModuleExplorerReload(handler: ModuleExplorerReload): void {
  reloadModuleStates = handler;
}

export async function refreshModuleExplorerStates(): Promise<void> {
  await reloadModuleStates?.();
}
