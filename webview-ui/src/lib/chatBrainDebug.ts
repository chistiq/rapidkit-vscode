const CHAT_BRAIN_DEBUG =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/** Dev-only Chat Brain protocol logger (stripped in production builds). */
export function logChatBrain(event: string, data?: unknown): void {
  if (!CHAT_BRAIN_DEBUG) {
    return;
  }
  if (data === undefined) {
    console.log('[ChatBrain]', event);
    return;
  }
  console.log('[ChatBrain]', event, data);
}
