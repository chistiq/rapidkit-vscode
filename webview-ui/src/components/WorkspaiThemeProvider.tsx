import { createContext, CSSProperties, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
    detectVSCodeThemeKind,
    normalizeThemeMode,
    resolveThemeKind,
    ThemeMode,
} from '@/components/StudioRedesign/styles/themeSystem';
import { resolveWorkspaiThemeOverrideStyle } from '@/lib/workspaiThemeOverrides';

type WorkspaiThemeKind = 'light' | 'dark';
type WorkspaiThemeSource = 'vscode' | 'override';

const DEFAULT_THEME_MODE: ThemeMode = 'auto';

const WorkspaiThemeModeContext = createContext<ThemeMode>(DEFAULT_THEME_MODE);

function syncWorkspaiThemeAttributes(kind: WorkspaiThemeKind, source: WorkspaiThemeSource): void {
    if (typeof document === 'undefined') {
        return;
    }

    const root = document.getElementById('root') || document.documentElement;
    root.setAttribute('data-workspai-theme-kind', kind);
    root.setAttribute('data-workspai-theme-source', source);
    document.documentElement.setAttribute('data-workspai-theme-kind', kind);
    document.documentElement.setAttribute('data-workspai-theme-source', source);
}

function useDetectedVSCodeThemeKind(enabled: boolean): WorkspaiThemeKind {
    const [themeKind, setThemeKind] = useState<WorkspaiThemeKind>(() => detectVSCodeThemeKind());

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }

        const sync = () => {
            setThemeKind(detectVSCodeThemeKind());
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
    }, [enabled]);

    return themeKind;
}

export function useWorkspaiThemeMode(): ThemeMode {
    return useContext(WorkspaiThemeModeContext);
}

export function useWorkspaiThemeKind(): WorkspaiThemeKind {
    const themeMode = useWorkspaiThemeMode();
    const vscodeKind = useDetectedVSCodeThemeKind(themeMode === 'auto');
    return useMemo(() => resolveThemeKind(themeMode), [themeMode, vscodeKind]);
}

interface WorkspaiThemeProviderProps {
    themeMode?: ThemeMode;
    children: ReactNode;
}

export function WorkspaiThemeProvider({
    themeMode = DEFAULT_THEME_MODE,
    children,
}: WorkspaiThemeProviderProps) {
    const normalizedThemeMode = normalizeThemeMode(themeMode);
    const themeKind = useWorkspaiThemeKindFromMode(normalizedThemeMode);
    const themeSource: WorkspaiThemeSource =
        normalizedThemeMode === 'auto' ? 'vscode' : 'override';
    const overrideStyle = useMemo(
        () => resolveWorkspaiThemeOverrideStyle(normalizedThemeMode, themeKind),
        [normalizedThemeMode, themeKind],
    );

    useEffect(() => {
        syncWorkspaiThemeAttributes(themeKind, themeSource);
    }, [themeKind, themeSource]);

    return (
        <WorkspaiThemeModeContext.Provider value={normalizedThemeMode}>
            <div
                className="workspai-theme-root"
                data-workspai-theme-kind={themeKind}
                data-workspai-theme-source={themeSource}
                style={overrideStyle as CSSProperties | undefined}
            >
                {children}
            </div>
        </WorkspaiThemeModeContext.Provider>
    );
}

function useWorkspaiThemeKindFromMode(themeMode: ThemeMode): WorkspaiThemeKind {
    const vscodeKind = useDetectedVSCodeThemeKind(themeMode === 'auto');
    return useMemo(() => resolveThemeKind(themeMode), [themeMode, vscodeKind]);
}
