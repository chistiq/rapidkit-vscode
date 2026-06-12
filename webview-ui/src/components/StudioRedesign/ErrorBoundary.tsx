/**
 * ErrorBoundary: Class-based React error boundary for Studio regions.
 * Catches render errors and shows a stable fallback instead of a blank panel.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { studioClass } from './styles/studioUi';

interface Props {
    children: ReactNode;
    /** Label shown in the fallback UI, e.g. "Context Panel" */
    region?: string;
}

interface State {
    hasError: boolean;
    errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            errorMessage: error?.message ?? 'Unknown render error',
        };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error(`[IncidentStudio] ErrorBoundary caught in "${this.props.region}"`, error, info);
    }

    private handleReset = () => {
        this.setState({ hasError: false, errorMessage: '' });
    };

    render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div role="alert" className={studioClass.errorBoundary}>
                <div className={studioClass.errorBoundaryBadge}>
                    {this.props.region ? `${this.props.region} — ` : ''}Render error
                </div>
                <div className={studioClass.errorBoundaryMessage}>
                    {this.state.errorMessage}
                </div>
                <button type="button" onClick={this.handleReset} className={studioClass.errorBoundaryRetry}>
                    Retry
                </button>
            </div>
        );
    }
}
