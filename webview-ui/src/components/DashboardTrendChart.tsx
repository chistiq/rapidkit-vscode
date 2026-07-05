import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import type { DashboardTrendSummary } from '@/lib/dashboardEvidence';

interface DashboardTrendChartProps {
  trend: DashboardTrendSummary | null | undefined;
}

const CHART_WIDTH = 280;
const CHART_HEIGHT = 64;
const CHART_PADDING = 4;

/**
 * Map a 0–100 series to an SVG polyline (x evenly spaced, y inverted so higher
 * values sit higher). Pure for testability.
 */
export function toTrendPolyline(
  values: number[],
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
  padding = CHART_PADDING
): string {
  if (values.length === 0) {
    return '';
  }
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const clamped = Math.max(0, Math.min(100, value));
      const x = padding + (values.length > 1 ? index * step : innerWidth / 2);
      const y = padding + innerHeight * (1 - clamped / 100);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function deltaLabel(delta: number | null): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (delta == null || delta === 0) {
    return { text: 'no change', tone: 'flat' };
  }
  return delta > 0
    ? { text: `+${delta}`, tone: 'up' }
    : { text: `${delta}`, tone: 'down' };
}

export function DashboardTrendChart({ trend }: DashboardTrendChartProps) {
  if (!trend || trend.points.length < 2) {
    return (
      <section className="ws-dashboard-trend ws-dashboard-trend--empty" aria-label="Health and impact trend">
        <div className="ws-dashboard-trend__header">
          <span className="ws-kicker">30-day trend</span>
          <p>
            Not enough history yet. Run the Governance Gate or Workspace Verify a few times to chart
            health and impact over time.
          </p>
        </div>
      </section>
    );
  }

  const gateHealthPoints = toTrendPolyline(trend.points.map((point) => point.gateHealth));
  const impactRiskPoints = toTrendPolyline(trend.points.map((point) => point.impactRisk));
  const health = deltaLabel(trend.gateHealthDelta);
  // For impact risk, a decrease is good — invert the tone semantics.
  const riskRaw = deltaLabel(trend.impactRiskDelta);
  const risk =
    riskRaw.tone === 'up'
      ? { ...riskRaw, tone: 'down' as const }
      : riskRaw.tone === 'down'
        ? { ...riskRaw, tone: 'up' as const }
        : riskRaw;
  const passRatePercent = Math.round(trend.gatePassRate * 100);
  const HealthTrendIcon =
    health.tone === 'up' ? TrendingUp : health.tone === 'down' ? TrendingDown : Activity;

  return (
    <section className="ws-dashboard-trend" aria-label="Health and impact trend">
      <div className="ws-dashboard-trend__header">
        <span className="ws-kicker">30-day trend</span>
        <h3>
          <HealthTrendIcon size={15} aria-hidden="true" /> Health &amp; impact
        </h3>
        <p>
          {trend.totalRuns} verify run(s) · gate pass rate {passRatePercent}%
        </p>
      </div>

      <svg
        className="ws-dashboard-trend__chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Gate health trend ${health.text}, impact risk trend ${risk.text}`}
      >
        <polyline
          className="ws-dashboard-trend__line ws-dashboard-trend__line--health"
          points={gateHealthPoints}
          fill="none"
        />
        <polyline
          className="ws-dashboard-trend__line ws-dashboard-trend__line--risk"
          points={impactRiskPoints}
          fill="none"
        />
      </svg>

      <div className="ws-dashboard-trend__legend" aria-label="Trend metrics">
        <span className="ws-dashboard-trend__metric">
          <span className="ws-dashboard-trend__swatch ws-dashboard-trend__swatch--health" aria-hidden="true" />
          Gate health
          <strong className={`ws-dashboard-trend__delta ws-dashboard-trend__delta--${health.tone}`}>
            {health.text}
          </strong>
        </span>
        <span className="ws-dashboard-trend__metric">
          <span className="ws-dashboard-trend__swatch ws-dashboard-trend__swatch--risk" aria-hidden="true" />
          Impact risk
          <strong className={`ws-dashboard-trend__delta ws-dashboard-trend__delta--${risk.tone}`}>
            {risk.text}
          </strong>
        </span>
      </div>
    </section>
  );
}
