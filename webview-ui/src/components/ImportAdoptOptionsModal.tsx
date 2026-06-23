import { useEffect, useState } from 'react';
import { ArrowLeftRight, FolderInput, Package } from 'lucide-react';
import { EnterpriseModal, EnterpriseModalNotice, EnterpriseModalSection } from './EnterpriseModal';

export type ProjectOnboardingMode = 'import' | 'adopt';

interface ImportAdoptOptionsModalProps {
  isOpen: boolean;
  mode: ProjectOnboardingMode;
  workspaceName?: string;
  onClose: () => void;
  onConfirm: (enableModules: boolean) => void;
}

const MODE_COPY: Record<
  ProjectOnboardingMode,
  { title: string; subtitle: string; kicker: string; icon: typeof FolderInput }
> = {
  import: {
    title: 'Import Project',
    subtitle: 'Add an existing folder or Git repository into the workspace',
    kicker: 'Onboarding',
    icon: FolderInput,
  },
  adopt: {
    title: 'Adopt Project',
    subtitle: 'Register an on-disk folder with RapidKit metadata and registry',
    kicker: 'Onboarding',
    icon: ArrowLeftRight,
  },
};

export function ImportAdoptOptionsModal({
  isOpen,
  mode,
  workspaceName,
  onClose,
  onConfirm,
}: ImportAdoptOptionsModalProps) {
  const copy = MODE_COPY[mode];
  const [enableModules, setEnableModules] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEnableModules(false);
    }
  }, [isOpen, mode]);

  if (!isOpen) {
    return null;
  }

  return (
    <EnterpriseModal
      isOpen={isOpen}
      title={copy.title}
      subtitle={workspaceName ? `${copy.subtitle} — ${workspaceName}` : copy.subtitle}
      kicker={copy.kicker}
      scope="workspace"
      icon={<copy.icon size={18} />}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="enterprise-button enterprise-button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="enterprise-button enterprise-button--primary"
            onClick={() => onConfirm(enableModules)}
          >
            Continue
          </button>
        </>
      }
    >
      <EnterpriseModalNotice tone="info">
        <Package size={14} />
        <span>
          Module commands (<code>add</code>, <code>modules</code>, …) are only supported for
          FastAPI and NestJS when <code>--enable-modules</code> is passed.
        </span>
      </EnterpriseModalNotice>

      <EnterpriseModalSection title="Module command support" meta="RapidKit npm">
        <fieldset className="import-adopt-options__choices">
          <label className="import-adopt-options__choice">
            <input
              type="radio"
              name="module-support"
              checked={!enableModules}
              onChange={() => setEnableModules(false)}
            />
            <span>
              <strong>Standard import/adopt</strong>
              <small>Follow runtime support matrix defaults (no --enable-modules)</small>
            </span>
          </label>
          <label className="import-adopt-options__choice">
            <input
              type="radio"
              name="module-support"
              checked={enableModules}
              onChange={() => setEnableModules(true)}
            />
            <span>
              <strong>Enable module commands</strong>
              <small>Pass --enable-modules for supported core runtimes</small>
            </span>
          </label>
        </fieldset>
      </EnterpriseModalSection>

      {mode === 'import' ? (
        <p className="modal-field__hint">
          Next step: choose a local folder or Git URL in the VS Code import wizard.
        </p>
      ) : (
        <p className="modal-field__hint">Next step: pick the folder to adopt in the file dialog.</p>
      )}
    </EnterpriseModal>
  );
}
