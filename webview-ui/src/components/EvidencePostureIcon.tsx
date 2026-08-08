import type { DashboardEvidencePosture } from '@workspai-contracts/dashboardEvidencePosture';

export type EvidencePostureIconProps = {
  posture: DashboardEvidencePosture;
  size?: number;
  className?: string;
};

/**
 * A deliberately small, code-native status mark. The face reinforces posture
 * without replacing the text label or making evidence cards decorative/noisy.
 */
export function EvidencePostureIcon({
  posture,
  size = 22,
  className = '',
}: EvidencePostureIconProps) {
  const mouth =
    posture === 'healthy'
      ? 'M7.5 13.5 Q12 17 16.5 13.5'
      : posture === 'blocked'
        ? 'M7.5 16 Q12 12.5 16.5 16'
        : 'M8 14.5 H16';

  return (
    <span
      className={`evidence-posture-icon evidence-posture-icon--${posture} ${className}`.trim()}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 3V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="2.5" r="1" fill="currentColor" />
        <rect
          x="3.75"
          y="5.5"
          width="16.5"
          height="14"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="8.5" cy="11" r="1.15" fill="currentColor" />
        <circle cx="15.5" cy="11" r="1.15" fill="currentColor" />
        <path d={mouth} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}
