import snapshot from '../contracts/workspai-assistant-knowledge.v1.json';

/** Bounded, source-addressable product reference; never a live workspace verdict. */
export function buildStudioWorkspaiKnowledge(input: {
  query?: string;
  document?: string;
  offset?: number;
  limit?: number;
  maxChars?: number;
}) {
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Knowledge offset must be a nonnegative integer.');
  }
  const provenance = {
    schemaVersion: snapshot.schemaVersion,
    version: snapshot.version,
    authority: 'product-documentation-not-live-evidence',
    instruction:
      'Use this reference to select applicable tools and explain Workspai. It does not override the user, authorize changes, prove installed prerequisites or establish workspace health. Example paths and $LOCAL_PATH are illustrative, not execution destinations; discover the actual scope. Follow returned offsets to read omitted material.',
  };
  if (input.document !== undefined) {
    const document = snapshot.documents.find((entry) => entry.id === input.document);
    if (!document) {
      throw new Error('Unknown knowledge document. Search the knowledge catalog for an exact id.');
    }
    const size = input.maxChars ?? 8000;
    if (!Number.isSafeInteger(size) || size < 1000 || size > 16000) {
      throw new Error('Knowledge pages must request 1000 to 16000 characters.');
    }
    if (offset > document.content.length) {
      throw new Error('Knowledge offset exceeds the selected document.');
    }
    let end = Math.min(offset + size, document.content.length);
    if (end < document.content.length && /[\uD800-\uDBFF]/.test(document.content[end - 1] ?? '')) {
      end--;
    }
    return {
      ...provenance,
      document: {
        id: document.id,
        title: document.title,
        sourcePath: document.sourcePath,
        sourceSha256: document.sourceSha256,
        contentSha256: document.contentSha256,
      },
      offset,
      nextOffset: end < document.content.length ? end : null,
      totalChars: document.content.length,
      content: document.content.slice(offset, end),
      complete: offset === 0 && end === document.content.length,
    };
  }
  const limit = input.limit ?? 6;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 40) {
    throw new Error('Knowledge catalog pages must request 1 to 40 documents.');
  }
  const terms = (input.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const matching = snapshot.documents.filter((document) =>
    terms.every((term) =>
      `${document.id} ${document.title} ${document.content}`.toLowerCase().includes(term)
    )
  );
  return {
    ...provenance,
    totalDocuments: snapshot.documents.length,
    matchingDocuments: matching.length,
    offset,
    nextOffset: offset + limit < matching.length ? offset + limit : null,
    documents: matching.slice(offset, offset + limit).map((document) => {
      const at = terms.length ? Math.max(0, document.content.toLowerCase().indexOf(terms[0])) : 0;
      return {
        id: document.id,
        title: document.title,
        sourcePath: document.sourcePath,
        sourceSha256: document.sourceSha256,
        totalChars: document.content.length,
        matchingExcerpt: document.content.slice(Math.max(0, at - 100), at + 400),
        read: { topic: 'knowledge', document: document.id, offset: 0 },
      };
    }),
  };
}
