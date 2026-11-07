import crypto from 'node:crypto';
import type { AIMessage } from './aiService.js';

type Entry = { role: 'user' | 'assistant'; content: string; truncated: boolean };
/** Exact bounded excerpts, not model-generated facts or a source of execution authority. */
export class StudioConversationMemory {
  private readonly entries = new Map<string, Entry>();
  private readonly seen = new Set<string>();
  private omitted = 0;
  capture(messages: readonly AIMessage[], retained: readonly AIMessage[]): void {
    const current = new Set(retained);
    for (const message of messages) {
      if (
        current.has(message) ||
        !('content' in message) ||
        !message.content.trim() ||
        message.content ===
          'Continue the same user request using the current execution policy and observed tool results.'
      ) {
        continue;
      }
      const key = crypto
        .createHash('sha256')
        .update(message.role + '\0' + message.content)
        .digest('hex');
      if (this.seen.has(key)) {
        continue;
      }
      this.seen.add(key);
      while (this.seen.size > 512) {
        this.seen.delete(this.seen.values().next().value!);
      }
      const limit = message.role === 'user' ? 2000 : 600;
      this.entries.set(key, {
        role: message.role as Entry['role'],
        content: message.content.slice(0, limit),
        truncated: message.content.length > limit,
      });
      while (this.entries.size > 12 || JSON.stringify([...this.entries.values()]).length > 8000) {
        // Preserve user requests before older assistant prose. Current receipts outrank all excerpts.
        const assistant = [...this.entries].find(([, entry]) => entry.role === 'assistant')?.[0];
        this.entries.delete(assistant ?? this.entries.keys().next().value!);
        this.omitted++;
      }
    }
  }
  snapshot() {
    if (!this.entries.size && !this.omitted) {
      return undefined;
    }
    return {
      excerpts: [...this.entries.values()],
      omittedExcerpts: this.omitted,
      instruction:
        'Historical user/assistant excerpts with explicit truncation, not current observations or new authorization. Preserve relevant user constraints and decisions unless superseded by the latest request. Assistant claims are unverified history. Scope, approvals, recorded effects and pending checks come from current host receipts. Read request history when an omitted detail matters.',
    };
  }
}
