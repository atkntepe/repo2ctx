import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import clipboardy from 'clipboardy';

import { getFiles } from './traverse.js';
import { generateText } from './generate.js';
import { loadConfig } from './config.js';
import { createCache } from './cache.js';

/**
 * File system watcher for real-time project monitoring
 * Provides debounced change detection with smart filtering and incremental updates
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default patterns to ignore during watch mode
 * These are common temporary and build files that shouldn't trigger regeneration
 */
const DEFAULT_WATCH_IGNORES = [
  // Build and dist directories
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/target/**',
  
  // Cache directories
  '**/.cache/**',
  '**/coverage/**',
  '**/.nyc_output/**',
  '**/.jest/**',
  
  // Version control
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  
  // IDE and editor files
  '**/.vscode/**',
  '**/.idea/**',
  '**/*.swp',
  '**/*.tmp',
  '**/*~',
  
  // OS files
  '**/.DS_Store',
  '**/Thumbs.db',
  
  // Logs and temporary files
  '**/*.log',
  '**/logs/**',
  '**/temp/**',
  '**/tmp/**',
  
  // Package manager files
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
];

/**
 * File watcher class that monitors project changes and regenerates output
 */
export class FileWatcher {
  constructor(options = {}) {
    this.watchers = new Map();
    this.debounceTimers = new Map();
    this.pendingProcessPromise = null;
    this.lastGeneratedFiles = new Set();
    this.watchStats = {
      totalChanges: 0,
      lastUpdate: null,
      filesWatched: 0,
      averageProcessingTime: 0,
      processingTimes: []
    };
    
    // Configuration
    this.config = {
      debounceDelay: options.debounce || 1000, // Default 1 second
      ignorePatterns: [...DEFAULT_WATCH_IGNORES, ...(options.ignorePatterns || [])],
      incremental: options.incremental !== false, // Default true
      copyToClipboard: options.clipboard || false,
      outputFile: options.outputFile || null,
      silent: options.silent || false,
      smartDiff: options.smartDiff || false,
      extensions: options.extensions || null,
      maxDepth: options.maxDepth || null,
      maxFileSize: options.maxFileSize || null,
      markdown: options.markdown || false,
      cacheDir: options.cacheDir || null,
      showChanges: options.showChanges || false
    };
    
    this.cache = null; // Will be initialized in startWatching
    this.log = this.config.silent ? () => {} : console.log;
  }

  /**
   * Start watching the specified directory
   * @param {string} watchPath - Directory to watch
   * @param {Object} options - Additional options
   */
  async startWatching(watchPath = process.cwd(), options = {}) {
    try {
      this.log('🔍 Starting watch mode...');
      
      // Load project configuration
      const projectConfig = await loadConfig();
      
      // Initialize cache if incremental processing is enabled
      if (this.config.incremental) {
        this.cache = await createCache({
          cacheDir: this.config.cacheDir,
          workingDir: watchPath
        });
        this.log('📦 Cache initialized for incremental processing');
      }
      
      // Initialize file list
      const initialFiles = await this.getFilteredFiles(watchPath, projectConfig);
      this.lastGeneratedFiles = new Set(initialFiles);
      this.watchStats.filesWatched = initialFiles.length;
      
      this.log(`👀 Watching ${initialFiles.length} files for changes...`);
      
      // Generate initial output
      await this.generateOutput(initialFiles, 'initial');
      
      // Create watcher
      const watcher = chokidar.watch(watchPath, {
        ignored: this.createIgnoreFunction(),
        ignoreInitial: true,
        persistent: true,
        followSymlinks: false,
        depth: this.config.maxDepth || undefined,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100
        }
      });
      
      // Set up event handlers
      watcher
        .on('add', (filePath) => this.handleFileChange('add', filePath, watchPath))
        .on('change', (filePath) => this.handleFileChange('change', filePath, watchPath))
        .on('unlink', (filePath) => this.handleFileChange('unlink', filePath, watchPath))
        .on('error', (error) => this.log(`❌ Watch error: ${error.message}`))
        .on('ready', () => {
          this.log('✅ Watch mode ready');
          this.log(`📊 Watching: ${this.watchStats.filesWatched} files`);
          this.log(`⚙️  Debounce: ${this.config.debounceDelay}ms`);
          if (this.config.copyToClipboard) this.log('📋 Auto-copy to clipboard: enabled');
          if (this.config.outputFile) this.log(`📄 Output file: ${this.config.outputFile}`);
        });
      
      this.watchers.set(watchPath, watcher);
      
      // Return cleanup function
      return () => this.stopWatching(watchPath);
      
    } catch (error) {
      this.log(`❌ Failed to start watching: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle file system changes with debouncing
   * @param {string} eventType - Type of change (add, change, unlink)
   * @param {string} filePath - Path of changed file
   * @param {string} watchPath - Root watch directory
   */
  async handleFileChange(eventType, filePath, watchPath) {
    const relativePath = path.relative(watchPath, filePath);
    
    this.log(`🔄 ${eventType.toUpperCase()}: ${relativePath}`);
    this.watchStats.totalChanges++;
    
    // Clear existing debounce timer
    if (this.debounceTimers.has(watchPath)) {
      clearTimeout(this.debounceTimers.get(watchPath));
    }
    
    // Set new debounce timer
    const timer = setTimeout(() => {
      const promise = this.processChanges(watchPath, eventType, filePath)
        .catch(error => {
        this.log(`❌ Error processing changes: ${error.message}`);
        })
        .finally(() => {
          this.debounceTimers.delete(watchPath);
          this.pendingProcessPromise = null;
        });

      this.pendingProcessPromise = promise;
    }, this.config.debounceDelay);
    
    this.debounceTimers.set(watchPath, timer);
  }

  async flushPendingChanges() {
    if (this.pendingProcessPromise) {
      await this.pendingProcessPromise;
    }
  }

  /**
   * Process accumulated changes and regenerate output
   * @param {string} watchPath - Root watch directory
   * @param {string} eventType - Last event type
   * @param {string} changedFilePath - Last changed file
   */
  async processChanges(watchPath, eventType, changedFilePath) {
    const startTime = Date.now();
    
    try {
      this.log('📝 Processing changes...');
      
      // Load current configuration
      const projectConfig = await loadConfig();
      
      // Get current file list
      const currentFiles = await this.getFilteredFiles(watchPath, projectConfig);
      
      let filesToProcess = currentFiles;
      
      // Incremental processing: only process changed files if enabled
      if (this.config.incremental && this.config.smartDiff) {
        const newFiles = currentFiles.filter(f => !this.lastGeneratedFiles.has(f));
        const removedFiles = [...this.lastGeneratedFiles].filter(f => !currentFiles.includes(f));
        
        if (newFiles.length > 0 || removedFiles.length > 0) {
          this.log(`📊 Changes detected: +${newFiles.length} files, -${removedFiles.length} files`);
          filesToProcess = currentFiles; // Full regeneration for file structure changes
        } else {
          // Only content changes, could potentially do incremental update
          filesToProcess = currentFiles; // For now, always do full regeneration
        }
      }
      
      // Update file tracking
      this.lastGeneratedFiles = new Set(currentFiles);
      this.watchStats.filesWatched = currentFiles.length;
      
      // Generate new output
      await this.generateOutput(filesToProcess, eventType);
      
      // Update statistics
      const processingTime = Date.now() - startTime;
      this.watchStats.processingTimes.push(processingTime);
      while (this.watchStats.processingTimes.length > 10) {
        this.watchStats.processingTimes.shift(); // Keep only last 10 times
      }
      this.watchStats.averageProcessingTime = 
        this.watchStats.processingTimes.reduce((a, b) => a + b, 0) / this.watchStats.processingTimes.length;
      this.watchStats.lastUpdate = new Date();
      
      this.log(`✅ Update completed in ${processingTime}ms`);
      
    } catch (error) {
      this.log(`❌ Failed to process changes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate output from file list
   * @param {string[]} files - Files to include in output
   * @param {string} changeType - Type of change that triggered this
   */
  async generateOutput(files, changeType) {
    try {
      // Handle incremental processing with cache
      let filesToProcess = files;
      let changeInfo = null;
      
      if (this.cache && changeType !== 'initial') {
        changeInfo = await this.cache.getChangedFiles(files);
        filesToProcess = changeInfo.changed;
        
        if (this.config.showChanges && changeInfo) {
          this.log(`📊 Changes detected: ${changeInfo.changed.length} changed, ${changeInfo.new.length} new, ${changeInfo.deleted.length} deleted`);
        }
        
        if (filesToProcess.length === 0) {
          this.log('✅ No changes detected, skipping regeneration');
          return;
        }
      }
      
      // Add watch mode header with statistics
      const watchHeader = this.generateWatchHeader(changeType, changeInfo);
      
      // Use generateText but capture output instead of writing directly
      const options = {
        dry: false,
        outputFile: this.config.outputFile,
        clipboard: this.config.copyToClipboard,
        markdown: this.config.markdown,
        concurrency: 5,
        cache: this.cache,
        changeInfo,
        highlightNew: changeInfo?.new.length > 0
      };
      
      // Generate the content using the existing generateText function
      await generateText(filesToProcess, options);
      
      // Update cache with processed files
      if (this.cache) {
        for (const filePath of filesToProcess) {
          await this.cache.updateFileCache(filePath, { 
            processed: true, 
            processedAt: new Date().toISOString(),
            watchMode: true 
          });
        }
        await this.cache.save();
      }
      
      // If we have an output file, prepend the watch header
      if (this.config.outputFile) {
        try {
          const existingContent = await fs.readFile(this.config.outputFile, 'utf8');
          const fullOutput = watchHeader + '\n\n' + existingContent;
          await fs.writeFile(this.config.outputFile, fullOutput, 'utf8');
          this.log(`📄 Output written to: ${this.config.outputFile}`);
        } catch (error) {
          this.log(`⚠️  Could not prepend watch header: ${error.message}`);
        }
      }
      
    } catch (error) {
      this.log(`❌ Failed to generate output: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate header with watch mode statistics
   * @param {string} changeType - Type of change
   * @param {Object} changeInfo - Change information from cache
   * @returns {string} Header text
   */
  generateWatchHeader(changeType, changeInfo = null) {
    const timestamp = new Date().toISOString();
    const stats = this.watchStats;
    
    let changeDetails = '';
    if (changeInfo) {
      changeDetails = `
Change Details:
- Files changed: ${changeInfo.changed.length}
- New files: ${changeInfo.new.length}
- Deleted files: ${changeInfo.deleted.length}`;
    }
    
    return `# Dir2Txt Watch Mode Report
Generated: ${timestamp}
Trigger: ${changeType}
Files Watched: ${stats.filesWatched}
Total Changes: ${stats.totalChanges}
Avg Processing Time: ${Math.round(stats.averageProcessingTime)}ms
Last Update: ${stats.lastUpdate ? stats.lastUpdate.toISOString() : 'N/A'}${changeDetails}

---`;
  }

  /**
   * Get filtered files based on configuration
   * @param {string} watchPath - Directory to scan
   * @param {Object} projectConfig - Project configuration
   * @returns {Promise<string[]>} Array of file paths
   */
  async getFilteredFiles(watchPath, projectConfig) {
    const traverseOptions = {
      includeExtensions: this.config.extensions || projectConfig.includeExtensions,
      maxDepth: this.config.maxDepth || projectConfig.maxDepth,
      maxFileSize: this.config.maxFileSize || projectConfig.maxFileSize,
      ignorePatterns: projectConfig.ignorePatterns || [],
      excludeLarge: true
    };
    
    return await getFiles(traverseOptions, watchPath);
  }

  /**
   * Create ignore function for chokidar
   * @returns {Function} Ignore function
   */
  createIgnoreFunction() {
    const patterns = this.config.ignorePatterns;
    
    return (filePath, stats) => {
      // Convert to relative path for pattern matching
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Check against ignore patterns
      for (const pattern of patterns) {
        // Simple glob-like matching
        if (this.matchesPattern(relativePath, pattern)) {
          return true;
        }
      }
      
      // Check file size if it's a file
      if (stats && stats.isFile() && this.config.maxFileSize) {
        if (stats.size > this.config.maxFileSize) {
          return true;
        }
      }
      
      return false;
    };
  }

  /**
   * Simple pattern matching for file paths
   * @param {string} filePath - File path to test
   * @param {string} pattern - Pattern to match against
   * @returns {boolean} True if matches
   */
  matchesPattern(filePath, pattern) {
    // Normalize paths to use forward slashes for consistent matching
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');
    
    // Convert glob-like pattern to regex
    const regexPattern = normalizedPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '§GLOBSTAR_SLASH§')
      .replace(/\*\*/g, '§GLOBSTAR§')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/§GLOBSTAR_SLASH§/g, '(?:.*/)?')
      .replace(/§GLOBSTAR§/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
  }

  /**
   * Stop watching a directory
   * @param {string} watchPath - Directory to stop watching
   */
  async stopWatching(watchPath = null) {
    if (watchPath && this.watchers.has(watchPath)) {
      const watcher = this.watchers.get(watchPath);
      await watcher.close();
      this.watchers.delete(watchPath);
      
      // Clear debounce timer
      if (this.debounceTimers.has(watchPath)) {
        clearTimeout(this.debounceTimers.get(watchPath));
        this.debounceTimers.delete(watchPath);
      }
      
      this.log(`🛑 Stopped watching: ${watchPath}`);
    } else {
      // Stop all watchers
      for (const [path, watcher] of this.watchers) {
        await watcher.close();
        if (this.debounceTimers.has(path)) {
          clearTimeout(this.debounceTimers.get(path));
          this.debounceTimers.delete(path);
        }
      }
      this.watchers.clear();
      this.debounceTimers.clear();
      this.log('🛑 Stopped all watchers');
    }
  }

  /**
   * Get current watch statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this.watchStats };
  }
}

/**
 * Convenience function to start watching with options
 * @param {string} watchPath - Directory to watch
 * @param {Object} options - Watch options
 * @returns {Promise<Function>} Cleanup function
 */
export async function startWatchMode(watchPath = process.cwd(), options = {}) {
  const watcher = new FileWatcher(options);
  return await watcher.startWatching(watchPath, options);
}

/**
 * Parse CLI debounce option (e.g., "500ms", "2s", "1000")
 * @param {string} debounceStr - Debounce string from CLI
 * @returns {number} Debounce delay in milliseconds
 */
export function parseDebounceOption(debounceStr) {
  if (!debounceStr) return 1000; // Default 1 second
  
  const match = debounceStr.match(/^(\d+)(ms|s)?$/);
  if (!match) {
    throw new Error(`Invalid debounce format: ${debounceStr}. Use formats like "500ms", "2s", or "1000"`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'ms'; // Default to milliseconds
  
  return unit === 's' ? value * 1000 : value;
}
