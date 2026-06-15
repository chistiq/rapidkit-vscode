import React from 'react';
import { Info, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { AnalysisScopeNotice } from '@/lib/incidentStudioAnalysisScope';

export interface AnalysisScopeNoticeBannerProps {
  notice: AnalysisScopeNotice;
  onDismiss?: () => void;
}

const toneIcon = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
} as const;

export const AnalysisScopeNoticeBanner: React.FC<AnalysisScopeNoticeBannerProps> = ({
  notice,
  onDismiss,
}) => {
  const Icon = toneIcon[notice.tone];

  return (
    <div
      className={`studio-scope-notice studio-scope-notice--${notice.tone}`}
      role="status"
      aria-live="polite"
    >
      <span className="studio-scope-notice__icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <div className="studio-scope-notice__copy">
        <strong className="studio-scope-notice__title">{notice.title}</strong>
        <span className="studio-scope-notice__message">{notice.message}</span>
      </div>
      {notice.dismissible && onDismiss ? (
        <button
          type="button"
          className="studio-scope-notice__dismiss"
          aria-label="Dismiss scope notice"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
};
