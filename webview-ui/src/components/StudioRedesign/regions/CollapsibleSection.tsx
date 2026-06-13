import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { studioClass } from '../styles/studioUi';

type CollapsibleSectionProps = {
    title: string;
    hint?: string;
    badge?: React.ReactNode;
    defaultOpen?: boolean;
    variant?: 'sidebar' | 'context';
    className?: string;
    children: React.ReactNode;
};

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    hint,
    badge,
    defaultOpen = false,
    variant = 'context',
    className = '',
    children,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const isSidebar = variant === 'sidebar';

    return (
        <section
            className={`${isSidebar ? studioClass.sidebarCollapse : studioClass.contextSection} studio-collapsible-section${open ? ' is-open' : ''} ${className}`.trim()}
        >
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className={`${studioClass.collapseTrigger}${open ? ' is-open' : ''}`}
                aria-expanded={open}
            >
                <span className={studioClass.collapseTitle}>{title}</span>
                {!open && hint ? (
                    <span className="studio-collapse-trigger__hint">{hint}</span>
                ) : null}
                {badge}
                <ChevronDown
                    size={11}
                    className={`${studioClass.chevron}${open ? ' is-open' : ''} ${studioClass.collapseChevron}`}
                />
            </button>
            {open ? (
                <div
                    className={
                        isSidebar ? studioClass.sidebarCollapseBody : 'studio-context-collapse__body'
                    }
                >
                    {children}
                </div>
            ) : null}
        </section>
    );
};
