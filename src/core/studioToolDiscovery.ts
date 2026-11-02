import type { StudioAgentModelContext } from './studioAgentSession.js';
import type {
  StudioAgentToolDefinition,
  StudioAgentToolRegistry,
} from './studioAgentToolRegistry.js';

const SEARCH = 'search-studio-tools';
const SCHEMA = 'workspai.studio-tool-search.v1';
const CORE = new Set([
  SEARCH,
  'inspect-workspace',
  'select-project',
  'inspect-source',
  'discover-workspace-files',
  'search-workspace',
  'inspect-agent-instructions',
  'apply-workspace-edits',
  'apply-workspace-patch',
  'run-workspace-command',
  'inspect-workspace-changes',
  'verify-blocker',
  'verify-goal',
  'inspect-cli-commands',
  'inspect-project-agent-entry',
  'update-task-ledger',
]);
const tokenize = (text: string): string[] =>
  text
    .normalize('NFKC')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

/** Portable schema discovery. Ranking is lexical; it does not claim embedding search. */
export function studioToolSearchTool(registry: StudioAgentToolRegistry): StudioAgentToolDefinition {
  return {
    name: SEARCH,
    title: 'Find and load available tools',
    activity: 'inspect',
    risk: 'read',
    scopeIndependent: true,
    description:
      'Find registered Studio capabilities and load their invocation schemas for the next model decision. Query a capability, or supply exact names from the deferred tool catalog. An empty query pages every available tool. All tools keep their existing mode, scope and approval rules. Search returns compact references, not execution results. Host/MCP tools are discovered with list-host-tools.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 300 },
        names: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: { type: 'string', maxLength: 200 },
        },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 8 },
      },
    },
    async execute(raw) {
      const input = (raw ?? {}) as {
        query?: unknown;
        names?: unknown;
        offset?: unknown;
        limit?: unknown;
      };
      const offset = input.offset ?? 0,
        limit = input.limit ?? (Array.isArray(input.names) ? input.names.length : 5);
      if (
        (input.query !== undefined &&
          (typeof input.query !== 'string' || input.query.length > 300)) ||
        !Number.isSafeInteger(offset) ||
        (offset as number) < 0 ||
        !Number.isSafeInteger(limit) ||
        (limit as number) < 1 ||
        (limit as number) > 8 ||
        (input.names !== undefined &&
          (!Array.isArray(input.names) ||
            !input.names.length ||
            input.names.length > 8 ||
            input.names.some(
              (name) => typeof name !== 'string' || !name.trim() || name.length > 200
            )))
      ) {
        throw new Error('Provide a capability query or exact tool names and valid pagination.');
      }
      const names = input.names as string[] | undefined;
      const catalog = registry.list();
      if (names?.some((name) => !catalog.some((tool) => tool.name === name))) {
        return {
          ok: false,
          error:
            'A selected tool is no longer registered in this mode. Search the current catalog.',
        };
      }
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      const terms = [...new Set(tokenize(query))];
      const tools = catalog
        .map((tool) => {
          const name = tokenize(tool.name),
            words = tokenize(tool.title + ' ' + tool.description);
          const score =
            tool.name === query
              ? 100
              : terms.reduce(
                  (sum, term) => sum + (name.includes(term) ? 5 : words.includes(term) ? 1 : 0),
                  0
                );
          return { tool, score };
        })
        .filter((entry) =>
          names ? names.includes(entry.tool.name) : !terms.length || entry.score > 0
        )
        .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
      const page = tools
        .slice(offset as number, (offset as number) + (limit as number))
        .map(({ tool }) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description.slice(0, 300),
          activity: tool.activity,
          risk: tool.risk,
        }));
      return {
        ok: true,
        output: {
          schemaVersion: SCHEMA,
          ranking: 'lexical',
          tools: page,
          total: tools.length,
          offset,
          nextOffset:
            (offset as number) + page.length < tools.length
              ? (offset as number) + page.length
              : null,
          instruction: tools.length
            ? 'Selected invocation schemas are available on the next model decision. Choose the appropriate tool; finding a tool did not execute it.'
            : 'No lexical matches. Use exact names from the deferred catalog or an empty query to page every available capability. No tool was executed.',
        },
      };
    },
  };
}

/** Only schemas are deferred. The controller retains the full governed registry. */
export class StudioToolDeferral {
  private readonly loaded = new Set<string>();
  private readonly observed = new Set<string>();
  private sessionId?: string;
  select(context: StudioAgentModelContext) {
    if (this.sessionId !== context.session.id) {
      this.loaded.clear();
      this.observed.clear();
      this.sessionId = context.session.id;
    }
    for (const observation of context.recentObservations ?? []) {
      const output = observation.result.output as
        | { schemaVersion?: unknown; tools?: Array<{ name?: unknown }> }
        | undefined;
      if (
        observation.toolName !== SEARCH ||
        !observation.result.ok ||
        output?.schemaVersion !== SCHEMA ||
        !Array.isArray(output.tools) ||
        this.observed.has(observation.toolCallId)
      ) {
        continue;
      }
      this.observed.add(observation.toolCallId);
      for (const tool of output.tools) {
        if (
          typeof tool.name !== 'string' ||
          !context.tools.some((candidate) => candidate.name === tool.name)
        ) {
          continue;
        }
        this.loaded.delete(tool.name);
        this.loaded.add(tool.name);
      }
      while (this.loaded.size > 16) {
        this.loaded.delete(this.loaded.values().next().value!);
      }
      while (this.observed.size > 128) {
        this.observed.delete(this.observed.values().next().value!);
      }
    }
    if (
      !context.tools.some((tool) => tool.name === SEARCH) ||
      context.tools.length <= 24 ||
      context.finalAnswerOnly ||
      context.finalOutcomeOnly
    ) {
      return { tools: context.tools, deferredNames: [] as string[] };
    }
    const pinned = context.requiredCausalAction?.toolName;
    const tools = context.tools.filter(
      (tool) => CORE.has(tool.name) || this.loaded.has(tool.name) || tool.name === pinned
    );
    return {
      tools,
      deferredNames: context.tools.filter((tool) => !tools.includes(tool)).map((tool) => tool.name),
    };
  }
}
