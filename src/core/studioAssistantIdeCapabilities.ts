import * as vscode from 'vscode';
import { StudioEditorTools } from './studioEditorTools.js';
import { StudioBrowserTools } from './studioBrowserTools.js';
import {
  StudioInteractiveTerminalManager,
  studioInteractiveTerminalTools,
} from './studioInteractiveTerminal.js';
import type { StudioAgentToolRegistry } from './studioAgentToolRegistry.js';

const services = new WeakMap<vscode.ExtensionContext, StudioAssistantIdeCapabilities>();
export class StudioAssistantIdeCapabilities implements vscode.Disposable {
  readonly editor = vscode.tasks && vscode.debug ? new StudioEditorTools() : undefined;
  readonly browser = new StudioBrowserTools();
  readonly terminals = new StudioInteractiveTerminalManager();
  register(registry: StudioAgentToolRegistry, readOnly: boolean): void {
    this.editor?.tools(readOnly).forEach((tool) => registry.register(tool));
    this.browser.tools(readOnly).forEach((tool) => registry.register(tool));
    studioInteractiveTerminalTools(this.terminals)
      .filter((tool) => !readOnly || tool.name === 'read-terminal')
      .forEach((tool) => registry.register(tool));
  }
  dispose(): void {
    this.editor?.dispose();
    this.browser.dispose();
    this.terminals.dispose();
  }
}
/** Resource ownership is extension-scoped; tool access remains session- and workspace-scoped. */
export function studioAssistantIdeCapabilities(
  context: vscode.ExtensionContext
): StudioAssistantIdeCapabilities {
  let current = services.get(context);
  if (!current) {
    current = new StudioAssistantIdeCapabilities();
    services.set(context, current);
    context.subscriptions.push(current);
  }
  return current;
}
