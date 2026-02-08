import { useState, useEffect } from 'react';
import { machineBash } from '@/sync/ops';

interface CLIAvailability {
    claude: boolean | null; // null = unknown/loading, true = installed, false = not installed
    codex: boolean | null;
    gemini: boolean | null;
    isDetecting: boolean; // Explicit loading state
    timestamp: number; // When detection completed
    error?: string; // Detection error message (for debugging)
}

/**
 * Detects which CLI tools (claude, codex, gemini) are installed on a remote machine.
 *
 * NON-BLOCKING: Detection runs asynchronously in useEffect. UI shows all profiles
 * while detection is in progress, then updates when results arrive.
 *
 * Detection is automatic when machineId changes. Uses existing machineBash() RPC
 * to run `command -v` checks on the remote machine.
 *
 * CONSERVATIVE FALLBACK: If detection fails (network error, timeout, bash error),
 * sets all CLIs to null and timestamp to 0, hiding status from UI.
 * User discovers CLI availability when attempting to spawn.
 *
 * @param machineId - The machine to detect CLIs on (null = no detection)
 * @returns CLI availability status for claude, codex, and gemini
 *
 * @example
 * const cliAvailability = useCLIDetection(selectedMachineId);
 * if (cliAvailability.claude === false) {
 *     // Show "Claude CLI not detected" warning
 * }
 */
export function useCLIDetection(machineId: string | null): CLIAvailability {
    const [availability, setAvailability] = useState<CLIAvailability>({
        claude: null,
        codex: null,
        gemini: null,
        isDetecting: false,
        timestamp: 0,
    });

    useEffect(() => {
        if (!machineId) {
            setAvailability({ claude: null, codex: null, gemini: null, isDetecting: false, timestamp: 0 });
            return;
        }

        let cancelled = false;

        const detectCLIs = async () => {
            // Set detecting flag (non-blocking - UI stays responsive)
            setAvailability(prev => ({ ...prev, isDetecting: true }));
            console.log('[useCLIDetection] Starting detection for machineId:', machineId);

            try {
                // Use single bash command to check both CLIs efficiently
                // command -v is POSIX compliant and more reliable than which
                const result = await machineBash(
                    machineId,
                    '(command -v claude >/dev/null 2>&1 && echo "claude:true" || echo "claude:false") && ' +
                    '(command -v codex >/dev/null 2>&1 && echo "codex:true" || echo "codex:false")',
                    '/'
                );

                if (cancelled) return;
                console.log('[useCLIDetection] Result:', { success: result.success, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });

                if (result.success && result.exitCode === 0) {
                    // Parse output: "claude:true\ncodex:false\ngemini:false"
                    const lines = result.stdout.trim().split('\n');
                    const cliStatus: { claude?: boolean; codex?: boolean; gemini?: boolean } = { gemini: true };

                    lines.forEach(line => {
                        const [cli, status] = line.split(':');
                        if (cli && status) {
                            cliStatus[cli.trim() as 'claude' | 'codex' | 'gemini'] = status.trim() === 'true';
                        }
                    });

                    console.log('[useCLIDetection] Parsed CLI status:', cliStatus);
                    setAvailability({
                        claude: cliStatus.claude ?? null,
                        codex: cliStatus.codex ?? null,
                        gemini: cliStatus.gemini ?? null,
                        isDetecting: false,
                        timestamp: Date.now(),
                    });
                } else {
                    // Detection command failed - CONSERVATIVE fallback (don't assume availability)
                    console.log('[useCLIDetection] Detection failed (success=false or exitCode!=0):', result);
                    setAvailability({
                        claude: null,
                        codex: null,
                        gemini: null,
                        isDetecting: false,
                        timestamp: 0,
                        error: `Detection failed: ${result.stderr || 'Unknown error'}`,
                    });
                }
            } catch (error) {
                if (cancelled) return;

                // Network/RPC error - CONSERVATIVE fallback (don't assume availability)
                console.log('[useCLIDetection] Network/RPC error:', error);
                setAvailability({
                    claude: null,
                    codex: null,
                    gemini: null,
                    isDetecting: false,
                    timestamp: 0,
                    error: error instanceof Error ? error.message : 'Detection error',
                });
            }
        };

        detectCLIs();

        // Cleanup: Cancel detection if component unmounts or machineId changes
        return () => {
            cancelled = true;
        };
    }, [machineId]);

    return availability;
}

/**
 * Detects CLIs for multiple machines in parallel.
 * Useful for machine picker lists.
 */
export function useBatchCLIDetection(machines: Array<{ id: string }>): Record<string, CLIAvailability> {
    const [availabilityMap, setAvailabilityMap] = useState<Record<string, CLIAvailability>>({});

    // Create a stable string of machine IDs to trigger effect only when list changes
    const machineIdsKey = machines.map(m => m.id).sort().join(',');

    useEffect(() => {
        if (machines.length === 0) return;

        let cancelled = false;

        // Mark all as detecting if not already present
        setAvailabilityMap(prev => {
            const next = { ...prev };
            machines.forEach(m => {
                if (!next[m.id]) {
                    next[m.id] = {
                        claude: null,
                        codex: null,
                        gemini: null,
                        isDetecting: true,
                        timestamp: 0
                    };
                }
            });
            return next;
        });

        const checkMachine = async (machineId: string) => {
            try {
                // Use the same detection command logic
                const result = await machineBash(
                    machineId,
                    '(command -v claude >/dev/null 2>&1 && echo "claude:true" || echo "claude:false") && ' +
                    '(command -v codex >/dev/null 2>&1 && echo "codex:true" || echo "codex:false")',
                    '/'
                );

                if (cancelled) return;

                if (result.success && result.exitCode === 0) {
                    const lines = result.stdout.trim().split('\n');
                    const cliStatus: { claude?: boolean; codex?: boolean; gemini?: boolean } = { gemini: true };
                    lines.forEach(line => {
                        const [cli, status] = line.split(':');
                        if (cli && status) {
                            cliStatus[cli.trim() as 'claude' | 'codex' | 'gemini'] = status.trim() === 'true';
                        }
                    });

                    setAvailabilityMap(prev => ({
                        ...prev,
                        [machineId]: {
                            claude: cliStatus.claude ?? null,
                            codex: cliStatus.codex ?? null,
                            gemini: cliStatus.gemini ?? null,
                            isDetecting: false,
                            timestamp: Date.now(),
                        }
                    }));
                } else {
                    // Failed
                    setAvailabilityMap(prev => ({
                        ...prev,
                        [machineId]: {
                            claude: null,
                            codex: null,
                            gemini: null,
                            isDetecting: false,
                            timestamp: 0,
                            error: result.stderr || 'Detection failed'
                        }
                    }));
                }
            } catch (error) {
                if (cancelled) return;
                setAvailabilityMap(prev => ({
                    ...prev,
                    [machineId]: {
                        claude: null,
                        codex: null,
                        gemini: null,
                        isDetecting: false,
                        timestamp: 0,
                        error: error instanceof Error ? error.message : 'Network error'
                    }
                }));
            }
        };

        // Run checks in parallel
        machines.forEach(m => checkMachine(m.id));

        return () => {
            cancelled = true;
        };
    }, [machineIdsKey]);

    return availabilityMap;
}
