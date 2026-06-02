import { AlertCircle, Download, Folder, Package } from 'lucide-react';
import { EnterpriseModal, EnterpriseModalNotice, EnterpriseModalSection } from './EnterpriseModal';
import type { ModuleData, WorkspaceStatus } from '@/types';

interface InstallModuleModalProps {
  isOpen: boolean;
  module: ModuleData | null;
  workspaceStatus: WorkspaceStatus;
  onClose: () => void;
  onConfirm: () => void;
}

export function InstallModuleModal({
  isOpen,
  module,
  workspaceStatus,
  onClose,
  onConfirm,
}: InstallModuleModalProps) {
  if (!isOpen || !module) {
    return null;
  }

  const isInstalled = workspaceStatus.installedModules?.some((m) => m.slug === module.slug);
  const installedVersion = workspaceStatus.installedModules?.find((m) => m.slug === module.slug)?.version;
  const moduleName = module.display_name || module.name;
  const moduleSlug = module.slug || module.id;
  const targetProjectName =
    workspaceStatus.projectName || workspaceStatus.projectType || workspaceStatus.workspaceName || 'Selected project';
  const targetContext = [
    workspaceStatus.workspaceName ? `Workspace: ${workspaceStatus.workspaceName}` : null,
    workspaceStatus.projectType ? `Framework: ${workspaceStatus.projectType}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <EnterpriseModal
      isOpen={isOpen}
      title={isInstalled ? 'Update Module' : 'Install Module'}
      subtitle="Review target, dependencies, and command before changing the selected project."
      kicker="Module operation"
      scope={workspaceStatus.workspaceName || 'Selected project'}
      icon={<Download size={16} />}
      size="md"
      onClose={onClose}
      footer={
        <div className="enterprise-modal-actions">
          <button type="button" className="enterprise-button enterprise-button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="enterprise-button enterprise-button--primary" onClick={onConfirm}>
            <Download size={14} />
            {isInstalled ? 'Update Module' : 'Install Module'}
          </button>
        </div>
      }
    >
      <EnterpriseModalSection title="Module">
        <div className="modal-metadata-card">
          <div className="modal-metadata-card__icon">
            <Package size={24} />
          </div>
          <div className="modal-metadata-card__body">
            <div className="modal-metadata-card__title">{moduleName}</div>
            <div className="modal-metadata-card__desc">{module.description}</div>
            <div className="modal-chip-row">
              <span className="modal-chip">v{module.version}</span>
              <span className="modal-chip">{module.category}</span>
              {module.status && module.status !== 'stable' && (
                <span className="modal-chip modal-chip--warning">{module.status}</span>
              )}
            </div>
          </div>
        </div>
      </EnterpriseModalSection>

      <EnterpriseModalSection title="Installation Target">
        <div className="modal-target-row">
          <Folder size={17} />
          <div>
            <div className="modal-target-row__name">{targetProjectName}</div>
            <div className="modal-target-row__path">{targetContext || 'Selected Workspai scope'}</div>
          </div>
        </div>
      </EnterpriseModalSection>

      {module.dependencies && module.dependencies.length > 0 && (
        <EnterpriseModalNotice tone="warning">
          <AlertCircle size={15} />
          <div>
            <strong>Dependencies will be installed with this module.</strong>
            <div className="modal-chip-row modal-chip-row--spaced">
              {module.dependencies.map((dep) => (
                <span key={dep} className="modal-chip modal-chip--mono">
                  {dep}
                </span>
              ))}
            </div>
          </div>
        </EnterpriseModalNotice>
      )}

      {isInstalled && (
        <EnterpriseModalNotice tone="warning">
          <AlertCircle size={15} />
          <span>
            Currently installed: <strong>v{installedVersion}</strong>
            {module.version && installedVersion && module.version !== installedVersion && (
              <>. This action updates it to <strong>v{module.version}</strong>.</>
            )}
          </span>
        </EnterpriseModalNotice>
      )}

      <EnterpriseModalSection title="Command Preview">
        <div className="modal-command-preview">
          <code>rapidkit add module {moduleSlug}</code>
        </div>
      </EnterpriseModalSection>
    </EnterpriseModal>
  );
}
