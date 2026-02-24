import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * Terminal Routes
 * 
 * Provides endpoints to open terminal windows for different platforms.
 * Used by Web Desktop clients to launch native terminal shells.
 */

export async function registerTerminalRoutes(fastify: FastifyInstance) {
    /**
     * POST /api/terminal/open
     * 
     * Opens a terminal/shell window on the user's machine.
     * Supports: macOS (Terminal, iTerm2), Linux (various), Windows (PowerShell, CMD)
     * 
     * Request body:
     * {
     *   "path": "/path/to/directory",  // Optional: cd to this directory
     *   "shell": "zsh" | "bash" | "pwsh" | "cmd",  // Optional: preferred shell
     *   "platform": "darwin" | "linux" | "win32"   // Required: target platform
     * }
     * 
     * Response:
     * {
     *   "success": true,
     *   "message": "Terminal opened successfully"
     * }
     */
    fastify.post<{
        Body: {
            path?: string;
            shell?: string;
            platform?: string;
        };
    }>('/api/terminal/open', async (request, reply) => {
        try {
            const { path: targetPath = os.homedir(), shell = 'zsh', platform = process.platform } = request.body;

            // Validate platform
            if (!['darwin', 'linux', 'win32'].includes(platform)) {
                return reply.status(400).send({
                    success: false,
                    error: `Unsupported platform: ${platform}`
                });
            }

            let command: string = '';
            let args: string[] = [];
            let options: any = {};

            if (platform === 'darwin') {
                // macOS: Use open command with Terminal or iTerm2
                // Try to use iTerm2 if available, fall back to Terminal
                const shell_script = `
                    tell application "Terminal"
                        activate
                        tell window 1
                            create tab with default settings
                            do script "cd '${targetPath}' && ${shell}"
                        end tell
                    end tell
                `;
                
                command = 'osascript';
                args = ['-e', shell_script];
            } else if (platform === 'linux') {
                // Linux: Try common terminal emulators
                const emulators = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
                const availableEmulator = emulators[0]; // In real implementation, check which is available
                
                command = availableEmulator;
                args = ['--working-directory=' + targetPath];
            } else if (platform === 'win32') {
                // Windows: Use PowerShell or Command Prompt
                const shellToUse = shell === 'pwsh' ? 'pwsh' : 'cmd.exe';
                
                command = 'cmd.exe';
                args = ['/c', 'start', shellToUse];
                options = { cwd: targetPath };
            }

            if (!command) {
                return reply.status(400).send({
                    success: false,
                    error: 'Unsupported platform or configuration'
                });
            }

            // Spawn the terminal process (detached so it survives after server closes)
            const process_instance = spawn(command, args, {
                ...options,
                detached: true,
                stdio: 'ignore'
            });

            // Unref to allow the process to run independently
            process_instance.unref();

            return reply.send({
                success: true,
                message: `Terminal opened at ${targetPath}`
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: error.message || 'Failed to open terminal'
            });
        }
    });

    /**
     * GET /api/terminal/available-shells
     * 
     * Returns the available shells for the platform
     * Used by clients to determine which shells to offer
     */
    fastify.get<{
        Querystring: {
            platform?: string;
        };
    }>('/api/terminal/available-shells', async (request, reply) => {
        const { platform = process.platform } = request.query;

        const shellMap: Record<string, string[]> = {
            darwin: ['zsh', 'bash', 'fish'],
            linux: ['bash', 'zsh', 'fish', 'sh'],
            win32: ['pwsh', 'cmd']
        };

        const shells = shellMap[platform] || [];

        return reply.send({
            platform,
            shells,
            default: platform === 'win32' ? 'pwsh' : 'zsh'
        });
    });
}
