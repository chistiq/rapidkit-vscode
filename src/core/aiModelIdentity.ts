/** Stable picker identity; unlike a short model id this disambiguates providers/BYOK. */
export function languageModelSelectionIdentifier(model: { id: string; vendor?: string }): string {
  const vendor = model.vendor?.trim();
  return vendor ? `${vendor}/${model.id}` : model.id;
}

/**
 * Some VS Code model registrations are transport adapters for first-party chat
 * sessions rather than callable Language Model API endpoints. For example,
 * Copilot CLI advertises models so VS Code can create `copilotcli:` sessions,
 * but its LM provider intentionally emits no response for extension requests.
 * Showing those entries in Workspai's picker creates a session that can never
 * produce a tool call.
 */
export function languageModelSupportsExtensionRequests(model: { vendor?: string }): boolean {
  const vendor = model.vendor?.trim().toLowerCase();
  return vendor !== 'copilotcli' && vendor !== 'claude-code';
}
