import type { DashboardActivityEntry } from './dashboardEvidence';

export const ACTIVITY_VISIBLE_EXPANDED = 10;

export function formatActivityTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function summarizeActivityLabels(entries: DashboardActivityEntry[], limit = 3): string {
  const labels: string[] = [];
  for (const entry of entries) {
    if (!labels.includes(entry.label)) {
      labels.push(entry.label);
    }
    if (labels.length >= limit) {
      break;
    }
  }
  return labels.join(', ');
}

export function activityEntryCountLabel(entry: DashboardActivityEntry): string | null {
  const count = entry.runCount ?? 1;
  return count > 1 ? `×${count}` : null;
}
