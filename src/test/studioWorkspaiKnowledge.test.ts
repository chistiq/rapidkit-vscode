import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import snapshot from '../contracts/workspai-assistant-knowledge.v1.json';
import closure from '../../contracts/official-cli-closure.v1.json';
import { buildStudioWorkspaiKnowledge } from '../core/studioWorkspaiKnowledge.js';
import { buildStudioWorkspaiArchitecture } from '../core/studioCliKnowledge.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

describe('Source-backed Workspai knowledge', () => {
  it.each([
    'React + Vite',
    'React Vite frontend project kits supported',
    'supported project kits Vite React frontend kit identifier',
  ])('finds the exact create lane from the natural-language query %j', async (query) => {
    const reference = buildStudioWorkspaiArchitecture(query);
    expect(reference.kits.map((kit) => kit.id)).toContain('frontend.vite-react');
    expect(reference.kits.every((kit) => kit.framework === 'vite-react')).toBe(true);
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const result = await registry.get('inspect-cli-commands')!.execute(
      { topic: 'architecture', query },
      {
        sessionId: 's',
        requestId: 'r',
        toolCallId: 't',
        workspacePath: '/fixture',
        signal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      ok: true,
      output: {
        kits: expect.arrayContaining([expect.objectContaining({ id: 'frontend.vite-react' })]),
      },
    });
    expect(JSON.stringify(result.output).length).toBeLessThan(4000);
    expect(result.output).not.toHaveProperty('scopeModel');
  });
  it('does not advertise a supported kit for an unknown query', () => {
    expect(buildStudioWorkspaiArchitecture('unsupported-unknown-generator').kits).toEqual([]);
  });
  it('preserves complete scope guidance for queries unrelated to starter kits', async () => {
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const result = await registry.get('inspect-cli-commands')!.execute(
      { topic: 'architecture', query: 'adopt external workspace ownership' },
      {
        sessionId: 's',
        requestId: 'r',
        toolCallId: 't',
        workspacePath: '/fixture',
        signal: new AbortController().signal,
      }
    );
    expect(result.output).toHaveProperty('scopeModel');
    expect(result.output).toHaveProperty('intelligence');
  });

  it('binds the complete document snapshot to the reference version and content digests', () => {
    expect(snapshot.version).toBe(closure.cli.version);
    expect(snapshot.documents.map((document) => document.id)).toEqual(
      expect.arrayContaining([
        'overview',
        'creation',
        'graph',
        'proof-carrying-change',
        'doctor',
        'repair',
        'run',
        'ci',
        'configuration',
      ])
    );
    for (const document of snapshot.documents) {
      expect(document.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(crypto.createHash('sha256').update(document.content).digest('hex')).toBe(
        document.contentSha256
      );
      expect(document.sourcePath).not.toMatch(/^[/\\]|\.\./);
    }
  });
  it('pages a long official guide without dropping text and never labels it current workspace evidence', () => {
    const expected = snapshot.documents.find((document) => document.id === 'graph')!;
    let offset: number | null = 0;
    let result = '';
    while (offset !== null) {
      const page = buildStudioWorkspaiKnowledge({ document: 'graph', offset, maxChars: 1000 });
      if (!('content' in page)) throw new Error('Expected a document page.');
      expect(page.authority).toBe('product-documentation-not-live-evidence');
      expect(page.content.length).toBeLessThanOrEqual(1000);
      result += page.content;
      offset = page.nextOffset;
    }
    expect(result).toBe(expected.content);
    expect(result).toContain('Model');
    expect(result).toContain('not proven');
  });
  it('searches and pages product domains independently of finite create lanes', () => {
    const page = buildStudioWorkspaiKnowledge({ query: 'tombstones', limit: 1 });
    if (!('documents' in page)) throw new Error('Expected document catalog.');
    expect(page.documents[0].id).toBe('proof-carrying-change');
    expect(page.documents[0].read).toEqual({
      topic: 'knowledge',
      document: 'proof-carrying-change',
      offset: 0,
    });
    const architecture = buildStudioWorkspaiArchitecture();
    expect(architecture.principles.runtimes).toContain('not a language allowlist');
    expect(architecture.principles.verification).toContain('separate verdicts');
    expect(architecture.principles.onboarding).toContain('Adopt keeps existing source in place');
  });
  it.each(['ask', 'plan', 'agent', 'goal'] as const)(
    'exposes the same bounded knowledge in %s without workspace setup',
    async (mode) => {
      const registry = createStudioAgentWorkspaiToolRegistry({
        host: {} as StudioAgentWorkspaiToolHost,
        cardId: 'assistant:knowledge',
        assistantMode: mode,
      });
      const result = await registry.get('inspect-cli-commands')!.execute(
        { topic: 'knowledge', document: 'goals', maxChars: 1000 },
        {
          sessionId: 's',
          requestId: 'r',
          toolCallId: 't',
          workspacePath: '/opt/fixtures/unavailable-scope',
          signal: new AbortController().signal,
        }
      );
      expect(result).toMatchObject({
        ok: true,
        output: {
          authority: 'product-documentation-not-live-evidence',
          offset: 0,
          nextOffset: 1000,
        },
      });
    }
  );
  it('rejects unknown document locators, invalid offsets and unbounded page sizes', () => {
    expect(() => buildStudioWorkspaiKnowledge({ document: '../secret' })).toThrow('Unknown');
    expect(() => buildStudioWorkspaiKnowledge({ offset: -1 })).toThrow('offset');
    expect(() => buildStudioWorkspaiKnowledge({ document: 'goals', maxChars: 100000 })).toThrow(
      '1000 to 16000'
    );
    expect(() => buildStudioWorkspaiKnowledge({ document: 'goals', offset: 999999 })).toThrow(
      'exceeds'
    );
  });
});
