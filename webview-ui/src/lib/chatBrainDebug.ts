const CHAT_BRAIN_DEBUG =
  (globalThis as typeof globalThis & { __WORKSPAI_CHAT_DEBUG__?: boolean })
    .__WORKSPAI_CHAT_DEBUG__ === true;

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
