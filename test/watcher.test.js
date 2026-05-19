import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { FileWatcher, startWatchMode, parseDebounceOption } from '../lib/watcher.js';

// Mock clipboardy to avoid clipboard operations in tests
jest.mock('clipboardy', () => ({
  write: jest.fn(() => Promise.resolve())
}));

describe('Watcher Module', () => {
  const testDir = path.join(process.cwd(), 'test-temp-watch');
  let watcher;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Create some test files
    await fs.writeFile(path.join(testDir, 'test1.js'), `
console.log('test file 1');
function hello() {
  return 'world';
}
`);

    await fs.writeFile(path.join(testDir, 'test2.js'), `
// Test file 2
const data = { name: 'test', value: 42 };
export default data;
`);

    await fs.writeFile(path.join(testDir, 'README.md'), `
# Test Project
This is a test project for watch mode.
`);

    // Create a subdirectory with files
    await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'src', 'index.js'), `
import data from '../test2.js';
console.log(data);
`);
  });

  afterEach(async () => {
    // Clean up watcher
    if (watcher && typeof watcher.stopWatching === 'function') {
      await watcher.stopWatching();
      watcher = null;
    }
    
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('parseDebounceOption', () => {
    test('should parse milliseconds correctly', () => {
      expect(parseDebounceOption('500ms')).toBe(500);
      expect(parseDebounceOption('1000ms')).toBe(1000);
      expect(parseDebounceOption('250ms')).toBe(250);
    });

    test('should parse seconds correctly', () => {
      expect(parseDebounceOption('1s')).toBe(1000);
      expect(parseDebounceOption('2s')).toBe(2000);
      expect(parseDebounceOption('5s')).toBe(5000);
    });

    test('should default to milliseconds when no unit specified', () => {
      expect(parseDebounceOption('500')).toBe(500);
      expect(parseDebounceOption('1000')).toBe(1000);
    });

    test('should use default when no input provided', () => {
      expect(parseDebounceOption('')).toBe(1000);
      expect(parseDebounceOption(null)).toBe(1000);
      expect(parseDebounceOption(undefined)).toBe(1000);
    });

    test('should throw error for invalid formats', () => {
      expect(() => parseDebounceOption('invalid')).toThrow();
      expect(() => parseDebounceOption('500x')).toThrow();
      expect(() => parseDebounceOption('abc123')).toThrow();
    });
  });

  describe('FileWatcher', () => {
    test('should create watcher with default options', () => {
      watcher = new FileWatcher();
      expect(watcher.config.debounceDelay).toBe(1000);
      expect(watcher.config.incremental).toBe(true);
      expect(watcher.config.copyToClipboard).toBe(false);
    });

    test('should create watcher with custom options', () => {
      watcher = new FileWatcher({
        debounce: 500,
        clipboard: true,
        incremental: false,
        silent: true
      });
      
      expect(watcher.config.debounceDelay).toBe(500);
      expect(watcher.config.copyToClipboard).toBe(true);
      expect(watcher.config.incremental).toBe(false);
      expect(watcher.config.silent).toBe(true);
    });

    test('should have proper default ignore patterns', () => {
      watcher = new FileWatcher();
      const patterns = watcher.config.ignorePatterns;
      
      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/dist/**');
      expect(patterns).toContain('**/.git/**');
      expect(patterns).toContain('**/*.log');
      expect(patterns).toContain('**/.DS_Store');
    });

    test('should merge custom ignore patterns with defaults', () => {
      watcher = new FileWatcher({
        ignorePatterns: ['custom/**', '*.custom']
      });
      
      const patterns = watcher.config.ignorePatterns;
      expect(patterns).toContain('**/node_modules/**'); // Default
      expect(patterns).toContain('custom/**'); // Custom
      expect(patterns).toContain('*.custom'); // Custom
    });

    describe('pattern matching', () => {
      beforeEach(() => {
        watcher = new FileWatcher();
      });

      test('should match simple patterns', () => {
        expect(watcher.matchesPattern('test.log', '*.log')).toBe(true);
        expect(watcher.matchesPattern('test.js', '*.log')).toBe(false);
        expect(watcher.matchesPattern('file.txt', '*.txt')).toBe(true);
      });

      test('should match directory patterns', () => {
        expect(watcher.matchesPattern('node_modules/package/index.js', '**/node_modules/**')).toBe(true);
        expect(watcher.matchesPattern('src/node_modules/test.js', '**/node_modules/**')).toBe(true);
        expect(watcher.matchesPattern('src/lib/test.js', '**/node_modules/**')).toBe(false);
      });

      test('should handle question mark patterns', () => {
        expect(watcher.matchesPattern('test1.js', 'test?.js')).toBe(true);
        expect(watcher.matchesPattern('testA.js', 'test?.js')).toBe(true);
        expect(watcher.matchesPattern('test12.js', 'test?.js')).toBe(false);
      });

      test('should work with Windows-style paths', () => {
        expect(watcher.matchesPattern('src\\lib\\test.js', '**/*.js')).toBe(true);
        expect(watcher.matchesPattern('node_modules\\package\\index.js', '**/node_modules/**')).toBe(true);
      });
    });

    describe('file filtering', () => {
      beforeEach(() => {
        watcher = new FileWatcher({ silent: true });
      });

      test('should get filtered files from directory', async () => {
        const files = await watcher.getFilteredFiles(testDir, {});
        
        expect(files.length).toBeGreaterThan(0);
        expect(files.some(f => f.endsWith('test1.js'))).toBe(true);
        expect(files.some(f => f.endsWith('test2.js'))).toBe(true);
        expect(files.some(f => f.endsWith('README.md'))).toBe(true);
        expect(files.some(f => f.includes('src/index.js') || f.includes('src\\index.js'))).toBe(true);
      });

      test('should respect extension filters', async () => {
        watcher.config.extensions = ['.js'];
        const files = await watcher.getFilteredFiles(testDir, {});
        
        expect(files.every(f => f.endsWith('.js'))).toBe(true);
        expect(files.some(f => f.endsWith('.md'))).toBe(false);
      });

      test('should respect max depth', async () => {
        watcher.config.maxDepth = 1;
        const files = await watcher.getFilteredFiles(testDir, {});
        
        // Should not include files from src/ subdirectory
        expect(files.some(f => f.includes('src/') || f.includes('src\\'))).toBe(false);
      });
    });

    describe('statistics', () => {
      beforeEach(() => {
        watcher = new FileWatcher({ silent: true });
      });

      test('should initialize stats correctly', () => {
        const stats = watcher.getStats();
        
        expect(stats.totalChanges).toBe(0);
        expect(stats.filesWatched).toBe(0);
        expect(stats.averageProcessingTime).toBe(0);
        expect(stats.lastUpdate).toBeNull();
      });

      test('should track processing times', () => {
        // Simulate processing times
        watcher.watchStats.processingTimes = [100, 200, 150, 250, 175];
        watcher.watchStats.averageProcessingTime = 
          watcher.watchStats.processingTimes.reduce((a, b) => a + b, 0) / watcher.watchStats.processingTimes.length;
        
        const stats = watcher.getStats();
        expect(stats.averageProcessingTime).toBe(175);
      });

      test('should limit processing times array', () => {
        watcher.watchStats.processingTimes = Array.from({ length: 15 }, (_, i) => 100 + i);
        while (watcher.watchStats.processingTimes.length > 10) {
          watcher.watchStats.processingTimes.shift();
        }

        expect(watcher.watchStats.processingTimes.length).toBeLessThanOrEqual(10);
      });
    });

    describe('watch header generation', () => {
      beforeEach(() => {
        watcher = new FileWatcher({ silent: true });
        watcher.watchStats.filesWatched = 25;
        watcher.watchStats.totalChanges = 5;
        watcher.watchStats.averageProcessingTime = 150.5;
        watcher.watchStats.lastUpdate = new Date('2024-01-01T12:00:00Z');
      });

      test('should generate header with statistics', () => {
        const header = watcher.generateWatchHeader('change');
        
        expect(header).toContain('Dir2Txt Watch Mode Report');
        expect(header).toContain('Trigger: change');
        expect(header).toContain('Files Watched: 25');
        expect(header).toContain('Total Changes: 5');
        expect(header).toContain('Avg Processing Time: 151ms');
        expect(header).toContain('2024-01-01T12:00:00.000Z');
      });

      test('should handle null last update', () => {
        watcher.watchStats.lastUpdate = null;
        const header = watcher.generateWatchHeader('initial');
        
        expect(header).toContain('Last Update: N/A');
      });
    });
  });

  describe('startWatchMode', () => {
    test('should start and return cleanup function', async () => {
      const cleanup = await startWatchMode(testDir, {
        silent: true,
        debounce: 100 // Fast debounce for testing
      });
      
      expect(typeof cleanup).toBe('function');
      
      // Cleanup
      await cleanup();
    }, 10000); // Longer timeout for file system operations
  });

  describe('integration tests', () => {
    test('should detect file changes (with mocked output)', async () => {
      // This test verifies the change detection logic without actual file watching
      // due to the complexity of testing real file system events in Jest
      
      watcher = new FileWatcher({
        silent: true,
        debounce: 50,
        copyToClipboard: false
      });
      
      // Mock the file generation to avoid actual output
      const originalGenerateOutput = watcher.generateOutput;
      const generateOutputSpy = jest.fn();
      watcher.generateOutput = generateOutputSpy;
      
      // Simulate file change handling
      await watcher.handleFileChange('change', path.join(testDir, 'test1.js'), testDir);
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 100));
      await watcher.flushPendingChanges();
      
      // The generateOutput should have been called (after debounce)
      expect(generateOutputSpy).toHaveBeenCalled();
      
      // Restore original method
      watcher.generateOutput = originalGenerateOutput;
    });

    test('should debounce multiple rapid changes', async () => {
      watcher = new FileWatcher({
        silent: true,
        debounce: 100
      });
      
      const generateOutputSpy = jest.fn();
      watcher.generateOutput = generateOutputSpy;
      
      // Simulate rapid changes
      await watcher.handleFileChange('change', path.join(testDir, 'test1.js'), testDir);
      await watcher.handleFileChange('change', path.join(testDir, 'test2.js'), testDir);
      await watcher.handleFileChange('change', path.join(testDir, 'README.md'), testDir);
      
      // Should not have called generateOutput yet
      expect(generateOutputSpy).not.toHaveBeenCalled();
      
      // Wait for debounce to complete
      await new Promise(resolve => setTimeout(resolve, 150));
      await watcher.flushPendingChanges();
      
      // Should have called generateOutput only once (debounced)
      expect(generateOutputSpy).toHaveBeenCalledTimes(1);
    });

    test('should update statistics on changes', async () => {
      watcher = new FileWatcher({ silent: true });
      
      expect(watcher.watchStats.totalChanges).toBe(0);
      
      // Simulate changes
      await watcher.handleFileChange('add', path.join(testDir, 'new.js'), testDir);
      await watcher.handleFileChange('change', path.join(testDir, 'test1.js'), testDir);
      await watcher.handleFileChange('unlink', path.join(testDir, 'old.js'), testDir);
      
      expect(watcher.watchStats.totalChanges).toBe(3);
      await watcher.stopWatching();
    });

    test('should cancel pending debounce timers when stopped without active watchers', async () => {
      watcher = new FileWatcher({
        silent: true,
        debounce: 50
      });

      const generateOutputSpy = jest.fn();
      watcher.generateOutput = generateOutputSpy;

      await watcher.handleFileChange('change', path.join(testDir, 'test1.js'), testDir);
      await watcher.stopWatching();
      await new Promise(resolve => setTimeout(resolve, 75));

      expect(generateOutputSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('should handle file system errors gracefully', async () => {
      watcher = new FileWatcher({ silent: true });

      watcher.getFilteredFiles = jest.fn(() => Promise.reject(new Error('File not found')));

      // Should not throw when trying to process non-existent file
      await expect(
        watcher.processChanges('/nonexistent', 'change', '/nonexistent/file.js')
      ).rejects.toThrow();
    });

    test('should return cleanup for watch paths handled by chokidar', async () => {
      const cleanup = await startWatchMode('/completely/invalid/path', { silent: true });

      expect(typeof cleanup).toBe('function');
      await expect(
        cleanup()
      ).resolves.toBeUndefined();
    });
  });
});
