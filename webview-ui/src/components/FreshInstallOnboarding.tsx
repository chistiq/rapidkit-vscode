import { Sparkles } from 'lucide-react';

interface FreshInstallOnboardingProps {
  templateCount: number;
  onBrowseCatalog: () => void;
}

export function FreshInstallOnboarding({
  templateCount,
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
          <div className="ws-kicker">Get started</div>
          <h2>Welcome to Workspai</h2>
          <p>
            Create your first Workspace Intelligence layer with <strong>Create with AI</strong>{' '}
            below — it opens the sidebar Create tab. Or{' '}
            <button type="button" className="fresh-install-onboarding__link" onClick={onBrowseCatalog}>
              browse Library
              {templateCount > 0 ? ` (${templateCount} templates)` : ''}
            </button>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
