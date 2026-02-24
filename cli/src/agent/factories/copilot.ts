/**
 * Copilot ACP Backend - GitHub Copilot CLI agent via ACP
 *
 * This module provides a factory function for creating a Copilot backend
 * that communicates using the Agent Client Protocol (ACP).
 *
 * GitHub Copilot CLI must be installed and available in PATH as 'copilot'.
 * The agent uses 'yolo' permission mode by default.
 */

import { AcpBackend, type AcpBackendOptions } from '../acp/AcpBackend';
import type { AgentBackend, AgentFactoryOptions, McpServerConfig } from '../core';
import { agentRegistry } from '../core';
import { geminiTransport } from '../transport';
import { logger } from '@/ui/logger';
import type { PermissionMode } from '@/api/types';

/**
 * Options for creating a Copilot ACP backend
 */
export interface CopilotBackendOptions extends AgentFactoryOptions {
    /** URL of the Happy MCP server */
    mcpServerUrl?: string;

    /** Permission mode (defaults to 'yolo') */
    permissionMode?: PermissionMode;

    /** Model to use (e.g., 'claude-haiku-4-5', 'gpt-5-mini', 'gpt-4.1') */
    model?: string;

    /** MCP servers to make available to the agent */
    mcpServers?: Record<string, McpServerConfig>;
}

/** Available Copilot CLI models */
export const COPILOT_MODELS = [
    'claude-haiku-4-5',
    'gpt-5-mini',
    'gpt-4.1',
] as const;

export type CopilotModel = typeof COPILOT_MODELS[number];

export const DEFAULT_COPILOT_MODEL: CopilotModel = 'gpt-4.1';

/**
 * Create a Copilot backend using ACP.
 *
 * The GitHub Copilot CLI must be installed and available in PATH.
 * Requires 'gh auth login' for authentication (uses system-level gh credentials).
 *
 * @param options - Configuration options
 * @returns AgentBackend instance
 */
export async function createCopilotBackend(options: CopilotBackendOptions): Promise<AgentBackend> {
    const copilotCommand = 'copilot';

    // Resolve model
    const model = options.model || DEFAULT_COPILOT_MODEL;

    const backendOptions: AcpBackendOptions = {
        agentName: 'copilot',
        cwd: options.cwd,
        command: copilotCommand,
        args: ['--experimental-acp'],
        env: {
            ...options.env,
            // Pass model via env var
            COPILOT_MODEL: model,
            // Default to yolo permission mode
            COPILOT_PERMISSION_MODE: options.permissionMode || 'yolo',
        },
        mcpServers: options.mcpServers,
        transportHandler: geminiTransport,
        hasChangeTitleInstruction: (prompt: string) => {
            const lower = prompt.toLowerCase();
            return lower.includes('change_title') ||
                lower.includes('change title') ||
                lower.includes('set title');
        },
    };

    logger.debug('[Copilot] Creating ACP backend with options:', {
        cwd: backendOptions.cwd,
        command: backendOptions.command,
        model,
        permissionMode: options.permissionMode || 'yolo',
    });

    return new AcpBackend(backendOptions);
}

/**
 * Register Copilot backend with the global agent registry.
 */
export function registerCopilotAgent(): void {
    agentRegistry.register('copilot', (opts) => {
        // Note: createCopilotBackend is async, but agentRegistry expects sync factory
        // We create it with default settings here
        const backendOptions: AcpBackendOptions = {
            agentName: 'copilot',
            cwd: opts.cwd,
            command: 'copilot',
            args: ['--experimental-acp'],
            env: {
                ...opts.env,
                COPILOT_MODEL: DEFAULT_COPILOT_MODEL,
                COPILOT_PERMISSION_MODE: 'yolo',
            },
            transportHandler: geminiTransport,
            hasChangeTitleInstruction: (prompt: string) => {
                const lower = prompt.toLowerCase();
                return lower.includes('change_title') || lower.includes('change title');
            },
        };
        return new AcpBackend(backendOptions);
    });
    logger.debug('[Copilot] Registered with agent registry');
}
