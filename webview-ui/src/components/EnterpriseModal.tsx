import type { ReactNode, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

export type EnterpriseModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface EnterpriseModalProps {
    isOpen: boolean;
    title: string;
    subtitle?: string;
    kicker?: string;
    scope?: string;
    icon?: ReactNode;
    size?: EnterpriseModalSize;
    lockClose?: boolean;
    headerActions?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    onClose: () => void;
}

export function EnterpriseModal({
    isOpen,
    title,
    subtitle,
    kicker,
    scope,
    icon,
    size = 'md',
    lockClose = false,
    headerActions,
    children,
    footer,
    onClose,
}: EnterpriseModalProps) {
    if (!isOpen) {
        return null;
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape' && !lockClose) {
            onClose();
        }
    };

    return (
        <>
            <div
                className="enterprise-modal-backdrop"
                onClick={lockClose ? undefined : onClose}
            />
            <div
                className={`enterprise-modal enterprise-modal--${size}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
            >
                <div className="enterprise-modal__header">
                    <div className="enterprise-modal__title-row">
                        {icon && <div className="enterprise-modal__icon">{icon}</div>}
                        <div className="enterprise-modal__copy">
                            {kicker && <div className="ws-kicker enterprise-modal__kicker">{kicker}</div>}
                            <div className="enterprise-modal__title">{title}</div>
                            {subtitle && <div className="enterprise-modal__subtitle">{subtitle}</div>}
                        </div>
                    </div>
                    <div className="enterprise-modal__header-actions">
                        {scope && <span className="ws-chip ws-chip--muted enterprise-modal__scope">{scope}</span>}
                        {headerActions}
                        {!lockClose && (
                            <button
                                type="button"
                                className="ws-btn ws-btn--ghost ws-btn--icon enterprise-modal__close"
                                onClick={onClose}
                                aria-label="Close"
                                title="Close"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="enterprise-modal__body">{children}</div>
                {footer && <div className="enterprise-modal__footer">{footer}</div>}
            </div>
        </>
    );
}

interface EnterpriseModalNoticeProps {
    tone?: 'info' | 'success' | 'warning' | 'danger';
    children: ReactNode;
}

export function EnterpriseModalNotice({ tone = 'info', children }: EnterpriseModalNoticeProps) {
    return <div className={`enterprise-modal-notice enterprise-modal-notice--${tone}`}>{children}</div>;
}

interface EnterpriseModalSectionProps {
    title?: string;
    meta?: string;
    children: ReactNode;
}

export function EnterpriseModalSection({ title, meta, children }: EnterpriseModalSectionProps) {
    return (
        <section className="enterprise-modal-section">
            {(title || meta) && (
                <div className="enterprise-modal-section__header">
                    {title && <h3>{title}</h3>}
                    {meta && <span>{meta}</span>}
                </div>
            )}
            {children}
        </section>
    );
}
