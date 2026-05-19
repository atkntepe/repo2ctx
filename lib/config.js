import { promises as fs } from 'fs';
import path from 'path';
import { validateConfigWithSuggestions, formatValidationErrors, ConfigValidationError } from './validation.js';

const CONFIG_FILE = '.dir2txt.json';

/**
 * Default configuration object with sensible defaults
 */
const DEFAULT_CONFIG = {
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '*.log',
    '.git/**',
    '.env*',
    'coverage/**',
    '.nyc_output/**'
  ],
  includeExtensions: [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.json',
    '.md',
    '.txt',
    '.py',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.css',
    '.html',
    '.xml',
    '.yaml',
    '.yml'
  ],
  maxFileSize: 1048576, // 1MB in bytes
  maxDepth: undefined, // No depth limit by default
  concurrency: 10, // Number of concurrent file operations
  excludeLarge: true, // Exclude large files by default
  followSymlinks: false // Don't follow symbolic links by default
};

/**
 * Loads configuration from .dir2txt.json in the provided directory
 * @param {string} cwd - Directory to load configuration from
 * @returns {Promise<Object>} Configuration object or empty object if no config exists
 */
export async function loadConfig(cwd = process.cwd()) {
  try {
    const configPath = path.join(cwd, CONFIG_FILE);
    const configData = await fs.readFile(configPath, 'utf8');
    
    // Parse JSON with better error reporting
    let config;
    try {
      config = JSON.parse(configData);
    } catch (parseError) {
      console.error(`❌ Invalid JSON in ${CONFIG_FILE}:`);
      console.error(`   ${parseError.message}`);
      console.error(`   Please fix the JSON syntax or run 'dir2txt config' to recreate the file.`);
      return {};
    }
    
    // Comprehensive validation
    const validation = validateConfigWithSuggestions(config);
    
    if (!validation.isValid) {
      console.error(`❌ Configuration file ${CONFIG_FILE} has errors:`);
      console.error(formatValidationErrors(validation.errors, validation.warnings));
      
      if (validation.suggestions.length > 0) {
        console.log('💡 Suggestions:');
        validation.suggestions.forEach(suggestion => console.log(`   ${suggestion}`));
      }
      
      console.log(`Using sanitized configuration where possible...`);
    } else if (validation.warnings && validation.warnings.length > 0) {
      console.warn(`⚠️  Configuration warnings in ${CONFIG_FILE}:`);
      console.warn(formatValidationErrors([], validation.warnings));
    }
    
    // Merge sanitized config with defaults
    const sanitizedConfig = validation.sanitized;
    return {
      ignorePatterns: sanitizedConfig.ignorePatterns || DEFAULT_CONFIG.ignorePatterns,
      includeExtensions: sanitizedConfig.includeExtensions || DEFAULT_CONFIG.includeExtensions,
      maxFileSize: sanitizedConfig.maxFileSize || DEFAULT_CONFIG.maxFileSize,
      maxDepth: sanitizedConfig.maxDepth || DEFAULT_CONFIG.maxDepth,
      concurrency: sanitizedConfig.concurrency || DEFAULT_CONFIG.concurrency,
      excludeLarge: sanitizedConfig.excludeLarge !== undefined ? sanitizedConfig.excludeLarge : DEFAULT_CONFIG.excludeLarge,
      followSymlinks: sanitizedConfig.followSymlinks !== undefined ? sanitizedConfig.followSymlinks : DEFAULT_CONFIG.followSymlinks
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Config file doesn't exist, return empty object
      return {};
    }
    
    if (error.code === 'EACCES') {
      console.warn(`⚠️  Cannot read ${CONFIG_FILE}: Permission denied. Using default configuration.`);
      return {};
    }
    
    console.warn(`⚠️  Error reading config file: ${error.message}. Using default configuration.`);
    return {};
  }
}

/**
 * Creates a default .dir2txt.json configuration file in the current working directory
 * @returns {Promise<void>}
 */
export async function createDefaultConfig() {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = JSON.stringify(DEFAULT_CONFIG, null, 2);
    await fs.writeFile(configPath, configData, 'utf8');
    console.log(`Created default configuration file: ${CONFIG_FILE}`);
  } catch (error) {
    console.error(`Error creating default config file: ${error.message}`);
    throw error;
  }
}

/**
 * Updates the existing configuration by merging with provided updates
 * @param {Object} updates - Configuration updates to merge
 * @returns {Promise<void>}
 */
export async function updateConfig(updates) {
  try {
    // Validate the updates first
    const validation = validateConfigWithSuggestions(updates);
    
    if (!validation.isValid) {
      console.error(`❌ Invalid configuration updates:`);
      console.error(formatValidationErrors(validation.errors, validation.warnings));
      
      if (validation.suggestions.length > 0) {
        console.log('💡 Suggestions:');
        validation.suggestions.forEach(suggestion => console.log(`   ${suggestion}`));
      }
      
      throw new ConfigValidationError('Configuration validation failed');
    }
    
    if (validation.warnings && validation.warnings.length > 0) {
      console.warn(`⚠️  Configuration warnings:`);
      console.warn(formatValidationErrors([], validation.warnings));
    }
    
    const currentConfig = await loadConfig();
    
    // Use sanitized updates
    const sanitizedUpdates = validation.sanitized;
    
    // Deep merge the updates with current config
    const updatedConfig = {
      ...currentConfig,
      ...sanitizedUpdates
    };
    
    // Handle array merging for ignorePatterns and includeExtensions
    if (sanitizedUpdates.ignorePatterns) {
      updatedConfig.ignorePatterns = sanitizedUpdates.ignorePatterns;
    }
    
    if (sanitizedUpdates.includeExtensions) {
      updatedConfig.includeExtensions = sanitizedUpdates.includeExtensions;
    }
    
    // Validate the final merged configuration
    const finalValidation = validateConfigWithSuggestions(updatedConfig);
    if (!finalValidation.isValid) {
      console.error(`❌ Final configuration would be invalid:`);
      console.error(formatValidationErrors(finalValidation.errors));
      throw new ConfigValidationError('Final configuration validation failed');
    }
    
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const configData = JSON.stringify(finalValidation.sanitized, null, 2);
    await fs.writeFile(configPath, configData, 'utf8');
    
    console.log(`✅ Updated configuration file: ${CONFIG_FILE}`);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error; // Re-throw validation errors
    }
    console.error(`❌ Error updating config file: ${error.message}`);
    throw error;
  }
}

/**
 * Deletes the .dir2txt.json configuration file from the current working directory
 * @returns {Promise<void>}
 */
export async function deleteConfig() {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    await fs.unlink(configPath);
    console.log(`Deleted configuration file: ${CONFIG_FILE}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Configuration file ${CONFIG_FILE} does not exist.`);
      return;
    }
    
    console.error(`Error deleting config file: ${error.message}`);
    throw error;
  }
}

/**
 * Gets the default configuration object
 * @returns {Object} Default configuration
 */
export function getDefaultConfig() {
  return {
    ignorePatterns: [...DEFAULT_CONFIG.ignorePatterns],
    includeExtensions: [...DEFAULT_CONFIG.includeExtensions],
    maxFileSize: DEFAULT_CONFIG.maxFileSize,
    maxDepth: DEFAULT_CONFIG.maxDepth,
    concurrency: DEFAULT_CONFIG.concurrency,
    excludeLarge: DEFAULT_CONFIG.excludeLarge,
    followSymlinks: DEFAULT_CONFIG.followSymlinks
  };
}
