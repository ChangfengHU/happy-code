import React from 'react';
import { useCallback } from 'react';

export interface OpenTerminalOptions {
    path?: string;
    shell?: string;
}

/**
 * Hook to open a terminal/shell window on the user's machine
 * Only works when the app is used as a Web Desktop client
 */
export function useOpenTerminal() {
    const open = useCallback(async (options?: OpenTerminalOptions) => {
        try {
            const platform = typeof process !== 'undefined' ? process.platform : 'darwin';
            const homeDir = typeof process !== 'undefined' ? process.env.HOME : '/Users';
            const path = options?.path || homeDir || '/';
            const shell = options?.shell || (platform === 'win32' ? 'pwsh' : 'zsh');

            const response = await fetch('/api/terminal/open', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path,
                    shell,
                    platform
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to open terminal');
            }

            const data = await response.json();
            console.debug('[Terminal] Opened successfully:', data);
            return { success: true, ...data };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Terminal] Failed to open:', message);
            throw error;
        }
    }, []);

    const getAvailableShells = useCallback(async () => {
        try {
            const platform = typeof process !== 'undefined' ? process.platform : 'darwin';
            const response = await fetch(`/api/terminal/available-shells?platform=${platform}`);

            if (!response.ok) {
                throw new Error('Failed to get available shells');
            }

            return await response.json();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Terminal] Failed to get shells:', message);
            const platform = typeof process !== 'undefined' ? process.platform : 'darwin';
            return {
                platform,
                shells: platform === 'win32' ? ['pwsh', 'cmd'] : ['bash', 'zsh'],
                default: platform === 'win32' ? 'pwsh' : 'zsh'
            };
        }
    }, []);

    return {
        open,
        getAvailableShells
    };
}
