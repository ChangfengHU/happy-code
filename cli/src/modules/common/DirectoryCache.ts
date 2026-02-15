/**
 * DirectoryCache - 目录结构内存缓存
 * 
 * 在 CLI 会话启动时扫描工作目录，缓存目录结构到内存中。
 * 使用 Node.js 内置的 fs.watch 监听文件变化，自动更新缓存。
 * 远程查询时直接返回缓存数据，无需再次读磁盘。
 */
import { readdir, stat } from 'fs/promises';
import { watch, FSWatcher } from 'fs';
import { join, relative } from 'path';
import { logger } from '@/ui/logger';

/** 缓存条目 */
interface CachedEntry {
    name: string;
    type: 'file' | 'directory' | 'other';
    size?: number;
    modified?: number;
}

/** 单个目录的缓存数据 */
interface CachedDirectory {
    entries: CachedEntry[];
    /** 缓存创建时间 */
    cachedAt: number;
}

/** 缓存配置 */
interface DirectoryCacheOptions {
    /** 工作目录（绝对路径） */
    workingDirectory: string;
    /** 缓存过期时间（毫秒），默认 30 秒 */
    ttl?: number;
    /** 初始预热的最大深度，默认 2 层 */
    warmupDepth?: number;
    /** 是否启用文件监听，默认 true */
    enableWatcher?: boolean;
}

export class DirectoryCache {
    private cache = new Map<string, CachedDirectory>();
    private watchers = new Map<string, FSWatcher>();
    private workingDirectory: string;
    private ttl: number;
    private warmupDepth: number;
    private enableWatcher: boolean;
    private closed = false;

    constructor(options: DirectoryCacheOptions) {
        this.workingDirectory = options.workingDirectory;
        this.ttl = options.ttl ?? 30_000; // 默认 30 秒过期
        this.warmupDepth = options.warmupDepth ?? 2;
        this.enableWatcher = options.enableWatcher ?? true;
    }

    /**
     * 初始化缓存：预热工作目录的前 N 层
     */
    async warmup(): Promise<void> {
        logger.debug(`[DirectoryCache] 开始预热缓存: ${this.workingDirectory}, 深度: ${this.warmupDepth}`);
        try {
            await this.warmupDirectory(this.workingDirectory, 0);
            logger.debug(`[DirectoryCache] 预热完成, 缓存了 ${this.cache.size} 个目录`);
        } catch (error) {
            logger.debug(`[DirectoryCache] 预热失败:`, error);
        }
    }

    /**
     * 递归预热目录
     */
    private async warmupDirectory(dirPath: string, depth: number): Promise<void> {
        if (depth >= this.warmupDepth || this.closed) return;

        // 读取并缓存当前目录
        const entries = await this.readAndCacheDirectory(dirPath);
        if (!entries) return;

        // 递归缓存子目录
        const subDirs = entries.filter(e => e.type === 'directory' && !this.shouldSkipDirectory(e.name));
        await Promise.all(
            subDirs.map(dir => this.warmupDirectory(join(dirPath, dir.name), depth + 1))
        );
    }

    /**
     * 判断是否跳过某些目录（node_modules、.git 等）
     */
    private shouldSkipDirectory(name: string): boolean {
        const skipList = [
            'node_modules', '.git', '.svn', '.hg',
            '__pycache__', '.cache', '.next', '.nuxt',
            'dist', 'build', '.expo', '.turbo',
            'coverage', '.nyc_output', '.vscode', '.idea',
        ];
        return name.startsWith('.') && name !== '..' || skipList.includes(name);
    }

    /**
     * 获取目录内容（优先从缓存读取）
     */
    async listDirectory(dirPath: string): Promise<CachedEntry[] | null> {
        // 检查缓存
        const cached = this.cache.get(dirPath);
        if (cached && !this.isExpired(cached)) {
            logger.debug(`[DirectoryCache] 缓存命中: ${dirPath}`);
            return cached.entries;
        }

        // 缓存未命中或已过期，从磁盘读取
        logger.debug(`[DirectoryCache] 缓存未命中: ${dirPath}`);
        return await this.readAndCacheDirectory(dirPath);
    }

    /**
     * 从磁盘读取目录并写入缓存
     */
    private async readAndCacheDirectory(dirPath: string): Promise<CachedEntry[] | null> {
        try {
            const rawEntries = await readdir(dirPath, { withFileTypes: true });
            const entries: CachedEntry[] = await Promise.all(
                rawEntries.map(async (entry) => {
                    const fullPath = join(dirPath, entry.name);
                    let type: 'file' | 'directory' | 'other' = 'other';
                    let size: number | undefined;
                    let modified: number | undefined;

                    if (entry.isDirectory()) {
                        type = 'directory';
                    } else if (entry.isFile()) {
                        type = 'file';
                    }

                    try {
                        const stats = await stat(fullPath);
                        size = stats.size;
                        modified = stats.mtime.getTime();
                    } catch {
                        // 跳过无法 stat 的文件
                    }

                    return { name: entry.name, type, size, modified };
                })
            );

            // 排序：目录在前，按字母顺序
            entries.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });

            // 写入缓存
            this.cache.set(dirPath, { entries, cachedAt: Date.now() });

            // 设置文件监听（如果启用且尚未监听）
            if (this.enableWatcher && !this.watchers.has(dirPath)) {
                this.watchDirectory(dirPath);
            }

            return entries;
        } catch (error) {
            logger.debug(`[DirectoryCache] 读取目录失败: ${dirPath}`, error);
            return null;
        }
    }

    /**
     * 监听目录变化，自动使缓存失效
     */
    private watchDirectory(dirPath: string): void {
        try {
            const watcher = watch(dirPath, { persistent: false }, (eventType, filename) => {
                if (this.closed) return;
                logger.debug(`[DirectoryCache] 文件变化检测: ${eventType} ${filename} in ${dirPath}`);
                // 使该目录缓存失效
                this.invalidate(dirPath);
            });

            watcher.on('error', (error) => {
                logger.debug(`[DirectoryCache] 监听器错误: ${dirPath}`, error);
                // 移除失败的监听器
                this.watchers.delete(dirPath);
            });

            this.watchers.set(dirPath, watcher);
        } catch (error) {
            logger.debug(`[DirectoryCache] 无法监听目录: ${dirPath}`, error);
        }
    }

    /**
     * 使指定目录的缓存失效
     */
    invalidate(dirPath: string): void {
        this.cache.delete(dirPath);
    }

    /**
     * 使所有缓存失效
     */
    invalidateAll(): void {
        this.cache.clear();
    }

    /**
     * 检查缓存是否过期
     */
    private isExpired(cached: CachedDirectory): boolean {
        return Date.now() - cached.cachedAt > this.ttl;
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): { cachedDirs: number; watcherCount: number } {
        return {
            cachedDirs: this.cache.size,
            watcherCount: this.watchers.size,
        };
    }

    /**
     * 关闭缓存并清理所有资源
     */
    close(): void {
        this.closed = true;
        // 关闭所有文件监听器
        for (const [path, watcher] of this.watchers) {
            try {
                watcher.close();
            } catch {
                // 忽略关闭错误
            }
        }
        this.watchers.clear();
        this.cache.clear();
        logger.debug('[DirectoryCache] 已关闭');
    }
}
