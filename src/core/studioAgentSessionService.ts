import type {
  StudioAgentModelAdapter,
  StudioAgentSessionOptions,
  StudioAgentSessionStore,
} from './studioAgentSession.js';
import { StudioAgentSession } from './studioAgentSession.js';
import type { StudioAgentToolRegistry } from './studioAgentToolRegistry.js';

export class StudioAgentSessionService {
  private readonly sessions = new Map<string, StudioAgentSession>();

  constructor(
    private readonly modelFactory: (options: StudioAgentSessionOptions) => StudioAgentModelAdapter,
    private readonly registryFactory: (
      options: StudioAgentSessionOptions
    ) => StudioAgentToolRegistry,
    private readonly store: StudioAgentSessionStore
  ) {}

  create(options: StudioAgentSessionOptions): StudioAgentSession {
    const session = new StudioAgentSession(
      options,
      this.modelFactory(options),
      this.registryFactory(options),
      this.store
    );
    this.sessions.set(session.id, session);
    return session;
  }

  async restore(
    sessionId: string,
    options: Omit<StudioAgentSessionOptions, 'id' | 'restoredSession'>
  ): Promise<StudioAgentSession | undefined> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const restored = await this.store.load?.(sessionId);
    if (!restored) {
      return undefined;
    }
    if (
      restored.workspacePath !== options.workspacePath ||
      restored.cardId !== options.cardId ||
      restored.assistantMode !== options.assistantMode ||
      restored.status === 'completed' ||
      restored.status === 'cancelled'
    ) {
      return undefined;
    }
    const session = new StudioAgentSession(
      { ...options, id: sessionId, restoredSession: restored },
      this.modelFactory({ ...options, id: sessionId, restoredSession: restored }),
      this.registryFactory({ ...options, id: sessionId, restoredSession: restored }),
      this.store
    );
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): StudioAgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  steer(sessionId: string, message: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.steer(message);
    return true;
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.cancel();
    return true;
  }
}
