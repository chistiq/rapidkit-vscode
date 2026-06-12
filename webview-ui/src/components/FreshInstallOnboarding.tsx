import { ArrowRight, Download, FolderKanban, Rocket, Sparkles } from 'lucide-react';

interface FreshInstallOnboardingProps {
    templateCount: number;
    onCreateWorkspace: () => void;
    onImportWorkspace: () => void;
    onBrowseCatalog: () => void;
}

export function FreshInstallOnboarding({
    templateCount,
    onCreateWorkspace,
    onImportWorkspace,
    onBrowseCatalog,
}: FreshInstallOnboardingProps) {
    return (
        <section className="ws-onboarding-shell fresh-install-onboarding" aria-label="Get started with Workspai">
            <div className="fresh-install-onboarding__hero">
                <Sparkles size={18} aria-hidden="true" />
                <div>
                    <div className="ws-kicker">Get started</div>
                    <h2>Welcome to Workspai</h2>
                    <p>
                        You have not created a workspace yet. Start with AI-assisted setup, pick a
                        starter template from Catalog, or import an existing team workspace.
                    </p>
                </div>
            </div>
            <div className="fresh-install-onboarding__cards">
                <button
                    type="button"
                    className="ws-onboarding-card ws-onboarding-card--primary fresh-install-onboarding__card fresh-install-onboarding__card--primary"
                    onClick={onCreateWorkspace}
                >
                    <Rocket size={16} aria-hidden="true" />
                    <span className="fresh-install-onboarding__card-copy">
                        <strong>Create workspace with AI</strong>
                        <small>Guided profile, projects, and bootstrap in one flow</small>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="ws-onboarding-card fresh-install-onboarding__card"
                    onClick={onBrowseCatalog}
                >
                    <FolderKanban size={16} aria-hidden="true" />
                    <span className="fresh-install-onboarding__card-copy">
                        <strong>Browse Catalog templates</strong>
                        <small>
                            {templateCount > 0
                                ? `${templateCount} starter workspaces ready to clone`
                                : 'Explore example workspaces and module packs'}
                        </small>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="ws-onboarding-card fresh-install-onboarding__card"
                    onClick={onImportWorkspace}
                >
                    <Download size={16} aria-hidden="true" />
                    <span className="fresh-install-onboarding__card-copy">
                        <strong>Import existing workspace</strong>
                        <small>Bring a share bundle or folder from your team</small>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" />
                </button>
            </div>
        </section>
    );
}
