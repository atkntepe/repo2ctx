import fg from 'fast-glob';
import ignore from 'ignore';
import { promises as fs } from 'fs';
import path from 'path';
import { loadConfig } from './config.js';

/**
 * Reads and parses .gitignore file to extract ignore patterns
 * @returns {Promise<string[]>} Array of ignore patterns from .gitignore
 */
async function parseGitignore(cwd = process.cwd()) {
  try {
    const gitignorePath = path.join(cwd, '.gitignore');
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
    
    // Use ignore library to parse .gitignore properly
    const ig = ignore().add(gitignoreContent);
    
    // Convert ignore patterns to glob patterns
    // Note: ignore library works differently than glob, so we need to extract patterns
    const lines = gitignoreContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    // Convert some common gitignore patterns to glob patterns
    return lines.map(pattern => {
      // Handle directory patterns
      if (pattern.endsWith('/')) {
        return pattern + '**';
      }
      // Handle patterns that should match in any directory
      if (!pattern.includes('/') && !pattern.startsWith('*')) {
        return '**/' + pattern;
      }
      return pattern;
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No .gitignore file found
      return [];
    }
    console.warn(`Warning: Error reading .gitignore: ${error.message}`);
    return [];
  }
}

/**
 * Filters files by extension
 * @param {string[]} files - Array of file paths
 * @param {string[]} includeExtensions - Array of extensions to include (e.g., ['.js', '.ts'])
 * @returns {string[]} Filtered array of files
 */
function filterByExtension(files, includeExtensions) {
  if (!includeExtensions || includeExtensions.length === 0) {
    return files;
  }
  
  return files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return includeExtensions.some(allowedExt => 
      allowedExt.toLowerCase() === ext
    );
  });
}

/**
 * Filters files by size using fs.stat
 * @param {string[]} files - Array of file paths
 * @param {number} maxFileSize - Maximum file size in bytes
 * @returns {Promise<string[]>} Filtered array of files under size limit
 */
async function filterBySize(files, maxFileSize, cwd = process.cwd()) {
  if (!maxFileSize || maxFileSize <= 0) {
    return files;
  }
  
  const filteredFiles = [];
  
  // Process files in batches to avoid overwhelming the system
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (file) => {
      try {
        const stats = await fs.stat(path.join(cwd, file));
        if (stats.isFile() && stats.size <= maxFileSize) {
          return file;
        }
      } catch (error) {
        // File might have been deleted or is inaccessible
        console.warn(`Warning: Cannot access file ${file}: ${error.message}`);
      }
      return null;
    });
    
    const batchResults = await Promise.all(batchPromises);
    filteredFiles.push(...batchResults.filter(file => file !== null));
  }
  
  return filteredFiles;
}

/**
 * Gets list of files based on provided options, applying filters and ignores
 * @param {Object} options - Configuration options
 * @param {string[]} [options.includeExtensions] - Extensions to include (e.g., ['.js', '.ts'])
 * @param {number} [options.maxDepth] - Maximum directory depth to traverse
 * @param {boolean} [options.excludeLarge=true] - Whether to exclude large files
 * @param {number} [options.maxFileSize] - Maximum file size in bytes
 * @param {string[]} [options.ignorePatterns] - Custom ignore patterns
 * @param {boolean} [options.useConfig=true] - Whether to inherit generation config filters
 * @param {string} cwd - Directory to traverse
 * @returns {Promise<string[]>} Array of filtered file paths relative to cwd
 */
export async function getFiles(options = {}, cwd = process.cwd()) {
  try {
    const {
      includeExtensions,
      maxDepth,
      excludeLarge = true,
      maxFileSize,
      ignorePatterns: customIgnorePatterns,
      useConfig = true
    } = options;
    
    // Load configuration
    const config = useConfig ? await loadConfig(cwd) : {};
    
    // Determine ignore patterns to use
    let ignorePatterns = [];
    
    if (customIgnorePatterns && customIgnorePatterns.length > 0) {
      // Use custom ignore patterns if provided
      ignorePatterns = customIgnorePatterns;
    } else if (config.ignorePatterns && config.ignorePatterns.length > 0) {
      // Use config ignore patterns if available
      ignorePatterns = config.ignorePatterns;
    } else {
      // Fallback to .gitignore patterns
      ignorePatterns = await parseGitignore(cwd);
    }
    
    // Add some basic ignores to prevent issues
    const basicIgnores = [
      'node_modules/**',
      '.git/**',
      '**/.DS_Store',
      '**/Thumbs.db'
    ];
    
    ignorePatterns = [...new Set([...basicIgnores, ...ignorePatterns])];
    
    // Configure fast-glob options
    const globOptions = {
      ignore: ignorePatterns,
      cwd,
      dot: true, // Include hidden files
      onlyFiles: true, // Only return files, not directories
      absolute: false, // Return relative paths
      stats: false // We'll stat separately if needed for size filtering
    };
    
    // Add depth limit if specified
    if (maxDepth && maxDepth > 0) {
      globOptions.deep = maxDepth;
    }
    
    // Get all files matching the pattern
    const startTime = Date.now();
    console.log('🔍 Scanning files...');
    const allFiles = await fg('**/*', globOptions);
    const scanTime = Date.now() - startTime;
    
    console.log(`✅ Found ${allFiles.length} files in ${scanTime}ms before filtering`);
    
    // Apply extension filtering
    let filteredFiles = allFiles;
    const extensionsToUse = includeExtensions || config.includeExtensions;
    if (extensionsToUse && extensionsToUse.length > 0) {
      filteredFiles = filterByExtension(filteredFiles, extensionsToUse);
      console.log(`${filteredFiles.length} files after extension filtering`);
    }
    
    // Apply size filtering if enabled
    if (excludeLarge) {
      const sizeLimit = maxFileSize || config.maxFileSize;
      if (sizeLimit && sizeLimit > 0) {
        const sizeStartTime = Date.now();
        console.log('📏 Filtering by file size...');
        filteredFiles = await filterBySize(filteredFiles, sizeLimit, cwd);
        const sizeTime = Date.now() - sizeStartTime;
        console.log(`✅ ${filteredFiles.length} files after size filtering (${sizeTime}ms)`);
      }
    }
    
    return filteredFiles.sort(); // Return sorted for consistent output
    
  } catch (error) {
    console.error(`Error during file traversal: ${error.message}`);
    throw error;
  }
}

/**
 * Gets files using .gitignore patterns specifically (utility function)
 * @param {Object} options - Configuration options
 * @param {string} cwd - Directory to traverse
 * @returns {Promise<string[]>} Array of file paths not ignored by .gitignore
 */
export async function getFilesWithGitignore(options = {}, cwd = process.cwd()) {
  const gitignorePatterns = await parseGitignore(cwd);
  return getFiles({
    ...options,
    ignorePatterns: gitignorePatterns
  }, cwd);
}

/**
 * Gets a quick count of files without full traversal (for large projects)
 * @param {Object} options - Configuration options  
 * @param {string} cwd - Directory to count files in
 * @returns {Promise<number>} Estimated file count
 */
export async function getFileCount(options = {}, cwd = process.cwd()) {
  try {
    const config = await loadConfig(cwd);
    const ignorePatterns = options.ignorePatterns || config.ignorePatterns || await parseGitignore(cwd);
    
    const globOptions = {
      ignore: ignorePatterns,
      cwd,
      dot: true,
      onlyFiles: true,
      absolute: false,
      stats: false
    };
    
    if (options.maxDepth && options.maxDepth > 0) {
      globOptions.deep = options.maxDepth;
    }
    
    const files = await fg('**/*', globOptions);
    
    // Apply extension filtering for count
    const extensionsToUse = options.includeExtensions || config.includeExtensions;
    if (extensionsToUse && extensionsToUse.length > 0) {
      return filterByExtension(files, extensionsToUse).length;
    }
    
    return files.length;
  } catch (error) {
    console.error(`Error getting file count: ${error.message}`);
    return 0;
  }
}
