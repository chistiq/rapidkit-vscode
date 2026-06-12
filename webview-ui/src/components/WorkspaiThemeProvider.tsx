import { ReactNode, useEffect, useState } from 'react';
import { detectVSCodeThemeKind } from '@/components/StudioRedesign/styles/themeSystem';

type WorkspaiThemeKind = 'light' | 'dark';

function syncWorkspaiThemeAttributes(kind: WorkspaiThemeKind): void {
    if (typeof document === 'undefined') {
        return;
    }

    const root = document.getElementById('root') || document.documentElement;
    root.setAttribute('data-workspai-theme-kind', kind);
    root.setAttribute('data-workspai-theme-source', 'vscode');
    document.documentElement.setAttribute('data-workspai-theme-kind', kind);
    document.documentElement.setAttribute('data-workspai-theme-source', 'vscode');
}

export function useWorkspaiThemeKind(): WorkspaiThemeKind {
    const [themeKind, setThemeKind] = useState<WorkspaiThemeKind>(() => detectVSCodeThemeKind());

    useEffect(() => {
        const sync = () => {
            const nextKind = detectVSCodeThemeKind();
            setThemeKind(nextKind);
            syncWorkspaiThemeAttributes(nextKind);
        };

        sync();

        if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
            return undefined;
        }

        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style', 'data-vscode-theme-kind'],
        });
        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-vscode-theme-kind'],
            });
        }
        if (document.head) {
            observer.observe(document.head, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }

        const intervalId = window.setInterval(sync, 500);
        return () => {
            observer.disconnect();
            window.clearInterval(intervalId);
        };
    }, []);

    return themeKind;
}

interface WorkspaiThemeProviderProps {
    children: ReactNode;
}

export function WorkspaiThemeProvider({ children }: WorkspaiThemeProviderProps) {
    const themeKind = useWorkspaiThemeKind();

    return (
        <div
            className="workspai-theme-root"
            data-workspai-theme-kind={themeKind}
            data-workspai-theme-source="vscode"
        >
            {children}
        </div>
    );
}
