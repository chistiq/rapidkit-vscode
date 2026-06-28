import { ChevronRight, Sparkles, Wrench } from 'lucide-react';

interface FreshInstallOnboardingProps {
  templateCount: number;
  onOpenSetup: () => void;
  onCreateWithAI: () => void;
  onBrowseCatalog: () => void;
}

export function FreshInstallOnboarding({
  templateCount,
  onOpenSetup,
  onCreateWithAI,
  onBrowseCatalog,
}: FreshInstallOnboardingProps) {
  return (
    <section
      className="ws-onboarding-shell fresh-install-onboarding fresh-install-onboarding--compact"
      aria-label="Get started with Workspai"
    >
      <div className="fresh-install-onboarding__hero">
        <Sparkles size={18} aria-hidden="true" />
        <div>
          <div className="ws-kicker">Setup recovery</div>
          <h2>Workspace Intelligence is not ready yet</h2>
          <p>Resolve the setup path first, then generate the first useful artifact.</p>
        </div>
      </div>
      <button
        type="button"
        className="fresh-install-onboarding__card fresh-install-onboarding__card--primary"
        onClick={onOpenSetup}
      >
        <Wrench size={16} aria-hidden="true" />
        <span className="fresh-install-onboarding__card-copy">
          <strong>Open Setup Recovery</strong>
          <small>Install or link the compatible CLI, select a workspace, then run the first model.</small>
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <details className="fresh-install-onboarding__details">
        <summary>Advanced start options</summary>
        <div className="fresh-install-onboarding__details-body">
          <button type="button" className="fresh-install-onboarding__link" onClick={onCreateWithAI}>
            Create with AI
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="fresh-install-onboarding__link" onClick={onBrowseCatalog}>
            Browse Library{templateCount > 0 ? ` (${templateCount} templates)` : ''}
          </button>
          <p>Recovery order: install compatible CLI, link local npm package if needed, select workspace, run first model, run doctor, run agent-sync.</p>
        </div>
      </details>
    </section>
  );
}
