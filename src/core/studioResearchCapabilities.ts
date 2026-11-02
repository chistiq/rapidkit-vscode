import * as vscode from 'vscode';
import { createConfiguredStudioAgentModel } from './configuredStudioAgentModel.js';
import { studioResearchSubagentTool } from './studioResearchSubagent.js';
import { studioExecutionSubagentTool } from './studioExecutionSubagent.js';
import { studioToolImageRetention } from './studioHostToolOutputStore.js';
import { VSCodeStudioAgentSessionStore } from './studioAgentSessionStore.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from './studioAgentWorkspaiTools.js';
import type { StudioAgentToolRegistry } from './studioAgentToolRegistry.js';
import { studioAssistantIdeCapabilities } from './studioAssistantIdeCapabilities.js';
import { studioSubagentHistoryTool } from './studioSubagentHistory.js';
import { studioToolSearchTool } from './studioToolDiscovery.js';
import { studioWorkspaceAssetTools } from './studioWorkspaceAssets.js';

/** Research has the same read-only capabilities across transports; no recursive delegation. */
export function registerStudioResearchCapability(input: {
  context: vscode.ExtensionContext;
  registry: StudioAgentToolRegistry;
  host: StudioAgentWorkspaiToolHost;
  token?: vscode.CancellationToken;
  modelId?: string;
}): void {
  for (const tool of studioWorkspaceAssetTools(input.context, (id) =>
    input.host.rememberNativeTransaction?.(id)
  )) {
    if (tool.risk === 'read' || input.registry.get('apply-workspace-patch')) {
      input.registry.register(tool);
    }
  }
  input.registry.register(studioSubagentHistoryTool(input.context));
  input.registry.register(studioToolSearchTool(input.registry));
  input.registry.register(
    studioResearchSubagentTool({
      store: new VSCodeStudioAgentSessionStore(input.context),
      workspaceTrusted: () => vscode.workspace.isTrusted,
      retainToolImages: studioToolImageRetention(
        input.context.storageUri?.fsPath ?? input.context.globalStorageUri.fsPath
      ),
      createModel: (objective) =>
        createConfiguredStudioAgentModel({
          context: input.context,
          objective,
          token: input.token,
          modelId: input.modelId,
          reviewAnswerDelivery: true,
        }),
      createRegistry: () => {
        const child = createStudioAgentWorkspaiToolRegistry({
          host: input.host,
          cardId: 'assistant:subagent',
          assistantMode: 'ask',
          executionAuthority: 'workspace',
        });
        studioAssistantIdeCapabilities(input.context).register(child, true);
        child.register(studioToolSearchTool(child));
        for (const tool of studioWorkspaceAssetTools(input.context).filter(
          (tool) => tool.risk === 'read'
        )) {
          child.register(tool);
        }
        return child;
      },
    })
  );
  // Read-only registries never acquire execution authority through delegation.
  if (input.registry.get('apply-workspace-patch') || input.registry.get('run-workspace-command')) {
    input.registry.register(
      studioExecutionSubagentTool({
        store: new VSCodeStudioAgentSessionStore(input.context),
        createModel: (objective) =>
          createConfiguredStudioAgentModel({
            context: input.context,
            objective,
            token: input.token,
            modelId: input.modelId,
            reviewAnswerDelivery: true,
          }),
      })
    );
  }
}
