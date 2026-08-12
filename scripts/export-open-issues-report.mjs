#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const DEFAULT_FETCH_ATTEMPTS = 4;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function parseArgs(argv) {
  const options = {
    output: path.resolve('artifacts/open-issues-report.json'),
    repo: process.env.GITHUB_REPOSITORY || '',
    state: 'open',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--output') {
      options.output = path.resolve(argv[i + 1] || options.output);
      i += 1;
      continue;
    }

    if (arg === '--repo') {
      options.repo = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    if (arg === '--state') {
      const value = String(argv[i + 1] || '')
        .trim()
        .toLowerCase();
      options.state = value || options.state;
      i += 1;
    }
  }

  return options;
}

function normalizeIssue(issue) {
  const labels = Array.isArray(issue?.labels)
    ? issue.labels.map((label) => {
        if (typeof label === 'string') {
          return { name: label };
        }
        return { name: label?.name || '' };
      })
    : [];

  return {
    id: issue?.id ?? issue?.number ?? null,
    number: issue?.number ?? null,
    title: typeof issue?.title === 'string' ? issue.title : '',
    state: typeof issue?.state === 'string' ? issue.state : 'open',
    isOpen: issue?.state !== 'closed',
    labels,
    html_url: issue?.html_url || null,
    created_at: issue?.created_at || null,
    updated_at: issue?.updated_at || null,
    pull_request: issue?.pull_request || null,
  };
}

function errorDetail(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  const causeDetail =
    cause && typeof cause === 'object'
      ? [cause.code, cause.message].filter(Boolean).join(': ')
      : cause
        ? String(cause)
        : '';
  return causeDetail ? `${error.message} (${causeDetail})` : error.message;
}

function retryAfterMs(response, attempt) {
  const retryAfter = response?.headers?.get?.('retry-after');
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(10_000, Math.round(seconds * 1_000));
  }
  return Math.min(4_000, 500 * 2 ** (attempt - 1));
}

async function requestIssuesPage({ url, headers, fetchImpl, sleep, attempts, timeoutMs }) {
  let lastFailure = 'unknown transport failure';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        return response;
      }

      const details = await response.text();
      lastFailure = `GitHub API request failed (${response.status} ${response.statusText}): ${details}`;
      if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt === attempts) {
        throw new Error(lastFailure);
      }
      const delayMs = retryAfterMs(response, attempt);
      console.warn(
        `[open-issues-report] GitHub API returned ${response.status}; retrying in ${delayMs}ms (${attempt}/${attempts}).`
      );
      await sleep(delayMs);
    } catch (error) {
      const detail = errorDetail(error);
      if (error instanceof Error && error.message.startsWith('GitHub API request failed')) {
        throw error;
      }
      lastFailure = detail;
      if (attempt === attempts) {
        break;
      }
      const delayMs = Math.min(4_000, 500 * 2 ** (attempt - 1));
      console.warn(
        `[open-issues-report] GitHub transport failed: ${detail}; retrying in ${delayMs}ms (${attempt}/${attempts}).`
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`GitHub API transport failed after ${attempts} attempt(s): ${lastFailure}`);
}

async function fetchIssues({
  repo,
  token,
  state,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = DEFAULT_FETCH_ATTEMPTS,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('This Node.js runtime does not provide fetch().');
  }
  const allIssues = [];
  let page = 1;

  while (true) {
    const url = new URL(`https://api.github.com/repos/${repo}/issues`);
    url.searchParams.set('state', state);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'workspai-release-gate',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await requestIssuesPage({
      url,
      headers,
      fetchImpl,
      sleep,
      attempts,
      timeoutMs,
    });

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      break;
    }

    allIssues.push(...payload);

    if (payload.length < 100) {
      break;
    }
    page += 1;
  }

  return allIssues;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.repo) {
    throw new Error('Missing repository. Provide --repo <owner/name> or set GITHUB_REPOSITORY.');
  }

  const token = process.env.GITHUB_TOKEN || '';
  const issues = await fetchIssues({ repo: options.repo, token, state: options.state });

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'github-rest-v3',
    repository: options.repo,
    state: options.state,
    issueCount: issues.length,
    issues: issues.map(normalizeIssue),
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(
    `[open-issues-report] wrote ${report.issueCount} issue(s) to ${options.output} for ${options.repo}.`
  );
}

export { fetchIssues, normalizeIssue, requestIssuesPage, retryAfterMs };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[open-issues-report] ${errorDetail(error)}`);
    process.exit(1);
  });
}
