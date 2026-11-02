import { routeAssistantIntent, type AssistantIntentRoute } from './assistantIntentRouter.js';
import {
  resolveAssistantExecutionPolicy,
  type AssistantExecutionPolicy,
} from './assistantExecutionPolicy.js';

/** Route every message before resolving workspace scope or resuming execution. */
export async function dispatchAssistantTurn(
  input: Parameters<typeof routeAssistantIntent>[0] & {
    isCancelled: () => boolean;
    respond: (answer: string) => void;
    suggest: (route: AssistantIntentRoute, policy: AssistantExecutionPolicy) => void;
    execute: (route: AssistantIntentRoute, policy: AssistantExecutionPolicy) => Promise<void>;
  }
): Promise<void> {
  const route = await routeAssistantIntent(input);
  if (input.isCancelled()) {
    return;
  }
  const policy = resolveAssistantExecutionPolicy({
    selectedMode: input.selectedMode,
    requestIntent: route.intent,
    routeConfidence: route.confidence,
    workspaceIntent: route.workspaceIntent,
  });
  if (policy.suggestion) {
    input.suggest(route, policy);
  }
  if (policy.profile === 'direct-response') {
    input.respond(
      policy.directResponse ||
        route.userResponse ||
        'What would you like me to change, investigate, or explain?'
    );
    return;
  }
  await input.execute(route, policy);
}
