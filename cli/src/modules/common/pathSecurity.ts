import { resolve } from 'path';

export interface PathValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validates that a path is within the allowed working directory
 * @param targetPath - The path to validate (can be relative or absolute)
 * @param workingDirectory - The session's working directory (must be absolute)
 * @returns Validation result
 */
export function validatePath(targetPath: string, workingDirectory: string): PathValidationResult {
    // Resolve both paths to absolute paths to handle path traversal attempts
    const resolvedTarget = resolve(workingDirectory, targetPath);
    const resolvedWorkingDir = resolve(workingDirectory);

    // Check if the resolved target path starts with the working directory
    // This prevents access to files outside the working directory
    if (!resolvedTarget.startsWith(resolvedWorkingDir + '/') && resolvedTarget !== resolvedWorkingDir) {
        return {
            valid: false,
            error: `Access denied: Path '${targetPath}' is outside the working directory`
        };
    }

    return { valid: true };
}

/**
 * Validates that a path is within at least one allowed root directory.
 * @param targetPath - The path to validate (can be relative or absolute)
 * @param allowedRoots - Allowed root directories (must be absolute or resolvable)
 * @returns Validation result
 */
export function validatePathWithinRoots(targetPath: string, allowedRoots: string[]): PathValidationResult {
    for (const root of allowedRoots) {
        const resolvedRoot = resolve(root);
        const resolvedTarget = resolve(root, targetPath);

        if (resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + '/')) {
            return { valid: true };
        }
    }

    return {
        valid: false,
        error: `Access denied: Path '${targetPath}' is outside the allowed directories`
    };
}
