import { describe, expect, it } from 'vitest';

import {
  parseReportExistsResult,
  parseReportLoadedMessage,
  isAnalyzeEvidencePending,
} from '../../webview-ui/src/lib/analyzeReportBridge';

describe('analyzeReportBridge', () => {
  it('reads reportExists from top-level exists field', () => {
    expect(parseReportExistsResult({ exists: true })).toBe(true);
    expect(parseReportExistsResult({ exists: false })).toBe(false);
  });

  it('reads report payload from top-level data field', () => {
    const report = {
      schemaVersion: '1',
      summary: { score: 88 },
    };
    expect(parseReportLoadedMessage({ data: report, error: null })).toEqual({
      report,
      error: null,
    });
  });

  it('surfaces host load errors', () => {
    expect(parseReportLoadedMessage({ data: null, error: 'Report file not found' })).toEqual({
      report: null,
      error: 'Report file not found',
    });
  });

  it('detects pending analyze evidence state', () => {
    expect(
      isAnalyzeEvidencePending({
        isLoading: true,
        report: null,
        error: null,
        exists: null,
      })
    ).toBe(true);
    expect(
      isAnalyzeEvidencePending({
        isLoading: true,
        report: null,
        error: 'missing',
        exists: false,
      })
    ).toBe(false);
  });
});
