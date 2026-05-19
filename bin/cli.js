#!/usr/bin/env node

/**
 * dir2txt CLI - Convert project directory structure and files to text for LLMs
 * 
 * Usage Examples:
 * 
 * Basic usage (generate text to directory-output.txt):
 *   dir2txt run
 * 
 * Generate with specific options:
 *   dir2txt run --dry                    # Only show file tree, no content
 *   dir2txt run --output project.txt     # Save to file
 *   dir2txt run --clipboard              # Copy to clipboard
 *   dir2txt run --max-size 512000        # Limit file size to 512KB
 *   dir2txt run --noconfig               # Ignore .dir2txt.json config
 *   dir2txt run --markdown               # Output in markdown format
 *   dir2txt run --ignore "*.test.js"     # Add extra ignore patterns
 * 
 * Search within file contents:
 *   dir2txt run --search "TODO|FIXME" --context 3    # Search with context
 *   dir2txt run --find-todos             # Find TODO, FIXME patterns
 *   dir2txt run --find-functions         # Find function definitions
 *   dir2txt run --content-filter "async" --regex     # Filter by content
 * 
 * Filter by modification date:
 *   dir2txt run --since "2024-01-01"     # Files modified since date
 *   dir2txt run --before "2024-12-31"    # Files modified before date
 * 
 * Smart file context & relationships:
 *   dir2txt run --include-relationships  # Show import/export relationships
 *   dir2txt run --file-summaries         # Add pattern-based file purpose summaries
 *   dir2txt run --include-dependencies   # Show dependency graph and relationships
 *   dir2txt run --group-by-feature       # Group files by functionality/module
 * 
 * Incremental processing & caching:
 *   dir2txt run --incremental            # Only process changed files
 *   dir2txt run --incremental --cache-dir .cache # Custom cache directory
 *   dir2txt run --show-changes           # Show what changed since last run
 *   dir2txt run --highlight-new          # Highlight new files in output
 *   dir2txt run --clear-cache            # Clear cache before processing
 * 
 * Watch mode (live updates):
 *   dir2txt watch                        # Watch current directory
 *   dir2txt watch --clipboard            # Auto-copy to clipboard
 *   dir2txt watch --output live.txt      # Output to file
 *   dir2txt watch --debounce 500ms       # Custom debounce delay
 *   dir2txt watch --ignore-temp          # Ignore temp files
 * 
 * Config management:
 *   dir2txt config                       # Create default .dir2txt.json
 *   dir2txt update --add "*.test.js"     # Add ignore pattern
 *   dir2txt update --remove "dist/**"    # Remove ignore pattern
 *   dir2txt templates --list             # Show project templates
 *   dir2txt templates --apply node       # Apply Node.js template
 *   dir2txt delete                       # Delete config file
 * 
 * Help and version:
 *   dir2txt --help                       # Show help
 *   dir2txt --version                    # Show version
 */

import { Command } from 'commander';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

// Import our library modules
import { getFiles } from '../lib/traverse.js';
import { generateText, generatePreview } from '../lib/generate.js';
import { 
  loadConfig, 
  createDefaultConfig, 
  updateConfig, 
  deleteConfig,
  getDefaultConfig 
} from '../lib/config.js';
import { createCache, processIncremental } from '../lib/cache.js';
import { startInteractiveMode } from '../lib/interactive.js';
import { validateConfigWithSuggestions, formatValidationErrors } from '../lib/validation.js';
import { 
  searchInFiles, 
  filterByDate, 
  filterByContent, 
  findCodePatterns, 
  findFunctionPatterns,
  generateSearchStats 
} from '../lib/search.js';
import { startWatchMode, parseDebounceOption } from '../lib/watcher.js';
import { 
  analyzeProjectRelationships, 
  groupFilesByFunction, 
  generateDependencyGraph 
} from '../lib/relationships.js';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagePath = path.join(__dirname, '..', 'package.json');

let packageInfo;
try {
  const packageData = await fs.readFile(packagePath, 'utf8');
  packageInfo = JSON.parse(packageData);
} catch (error) {
  packageInfo = { version: '1.0.0', description: 'Prepare repository context for AI coding agents' };
}

const program = new Command();
const ALLOWED_FORMATS = new Set(['text', 'markdown', 'xml', 'json']);
const invokedName = path.basename(process.argv[1] || 'repo2ctx');

// Set up program info
program
  .name(invokedName === 'dir2txt' ? 'dir2txt' : 'repo2ctx')
  .description(packageInfo.description || 'Prepare repository context for AI coding agents')
  .version(packageInfo.version || '1.0.0');

function applyGenerationOptions(command) {
  return command
    .option('--dry', 'Only show file tree, no file contents')
    .option('--output <file>', 'Output to file instead of stdout')
    .option('--clipboard', 'Copy output to clipboard')
    .option('--max-size <bytes>', 'Maximum file size in bytes', parseInt)
    .option('--noconfig', 'Ignore .dir2txt.json config file')
    .option('--markdown', 'Output in markdown format')
    .option('--format <format>', 'Output format: text, markdown, json, or xml', 'text')
    .option('--redact', 'Redact sensitive file content', true)
    .option('--preview <count>', 'Show preview with first N files', parseInt)
    .option('--extensions <ext...>', 'Only include files with these extensions (e.g., .js .ts)')
    .option('--ignore <patterns...>', 'Additional ignore patterns (e.g., "*.test.js" "temp/**")')
    .option('--max-depth <depth>', 'Maximum directory depth to traverse', parseInt)
    .option('--search <pattern>', 'Search for pattern within file contents')
    .option('--regex', 'Treat search pattern as regular expression')
    .option('--case-sensitive', 'Make search case sensitive')
    .option('--context <lines>', 'Show N lines of context around matches', parseInt)
    .option('--since <date>', 'Include only files modified since date (YYYY-MM-DD)')
    .option('--before <date>', 'Include only files modified before date (YYYY-MM-DD)')
    .option('--content-filter <pattern>', 'Include only files containing pattern')
    .option('--find-todos', 'Search for TODO, FIXME, and similar patterns')
    .option('--find-functions', 'Search for function definitions and patterns')
    .option('--include-relationships', 'Include import/export relationships between files')
    .option('--file-summaries', 'Add pattern-based purpose summaries for each file')
    .option('--include-dependencies', 'Show dependency graph and file relationships')
    .option('--group-by-feature', 'Group files by functionality/module instead of directory')
    .option('--incremental', 'Only process changed files using cache')
    .option('--cache-dir <path>', 'Cache directory path (default: .dir2txt-cache)')
    .option('--show-changes', 'Show what files changed since last run')
    .option('--highlight-new', 'Highlight new files in output')
    .option('--clear-cache', 'Clear cache before processing');
}

async function runDirectoryGeneration(options, command) {
    const formatSource = command?.getOptionValueSource?.('format');
    if (options.markdown && formatSource !== 'cli') {
      options.format = 'markdown';
    }

    let restoreConsoleLog = () => {};
    try {
      if (!ALLOWED_FORMATS.has(options.format)) {
        throw new Error(`Invalid format "${options.format}". Allowed formats: text, markdown, xml, json`);
      }

      restoreConsoleLog = options.format === 'json' || options.format === 'xml'
        ? (() => {
            const originalLog = console.log;
            console.log = (...args) => console.error(...args);
            return () => {
              console.log = originalLog;
            };
          })()
        : () => {};

      console.log(`🔍 Starting ${program.name()}...`);
      
      // Load configuration unless --noconfig is specified
      let config = {};
      if (!options.noconfig) {
        config = await loadConfig();
        if (Object.keys(config).length > 0) {
          console.log('📋 Using configuration from .dir2txt.json');
        }
      }
      
      // Build options for file traversal
      const traverseOptions = {
        includeExtensions: options.extensions || config.includeExtensions,
        maxDepth: options.maxDepth || config.maxDepth,
        maxFileSize: options.maxSize || config.maxFileSize,
        excludeLarge: true
      };
      
      // Add command-line ignore patterns if provided
      if (options.ignore && options.ignore.length > 0) {
        const baseIgnores = config.ignorePatterns || [];
        traverseOptions.ignorePatterns = [...baseIgnores, ...options.ignore];
      }
      
      // Initialize cache if incremental processing is enabled
      let cache = null;
      if (options.incremental || options.showChanges || options.clearCache) {
        cache = await createCache({
          cacheDir: options.cacheDir,
          enabled: !options.clearCache
        });

        if (options.clearCache) {
          await cache.clear();
          cache = await createCache({ cacheDir: options.cacheDir });
        }
      }

      // Get list of files
      console.log('📁 Scanning directory...');
      let files = await getFiles(traverseOptions);
      
      if (files.length === 0) {
        console.log('❌ No files found matching criteria');
        process.exit(1);
      }
      
      console.log(`✅ Found ${files.length} files`);

      // Handle incremental processing and change detection
      let changedFiles = files;
      let changeInfo = null;
      
      if (cache) {
        changeInfo = await cache.getChangedFiles(files);
        
        if (options.showChanges) {
          console.log(`\n📊 Change Analysis:`);
          console.log(`   📄 Total files: ${files.length}`);
          console.log(`   🔄 Changed: ${changeInfo.changed.length}`);
          console.log(`   ✨ New: ${changeInfo.new.length}`);
          console.log(`   🗑️  Deleted: ${changeInfo.deleted.length}`);
          
          if (changeInfo.new.length > 0) {
            console.log(`   📝 New files: ${changeInfo.new.slice(0, 5).map(f => path.basename(f)).join(', ')}${changeInfo.new.length > 5 ? ` (+${changeInfo.new.length - 5} more)` : ''}`);
          }
        }
        
        if (options.incremental) {
          changedFiles = changeInfo.changed;
          if (changedFiles.length === 0) {
            console.log('✅ No changes detected, skipping processing');
            return;
          }
          console.log(`🚀 Processing ${changedFiles.length} changed files`);
        }
      }

      // Apply date filtering if specified
      if (options.since || options.before) {
        console.log('📅 Applying date filters...');
        changedFiles = await filterByDate(changedFiles, {
          since: options.since,
          before: options.before
        });
        console.log(`✅ ${changedFiles.length} files after date filtering`);
      }

      // Apply content filtering if specified
      if (options.contentFilter) {
        console.log('🔍 Applying content filter...');
        changedFiles = await filterByContent(changedFiles, options.contentFilter, {
          regex: options.regex,
          caseSensitive: options.caseSensitive
        });
        console.log(`✅ ${changedFiles.length} files contain the specified pattern`);
      }

      // Handle search operations
      let searchResults = null;
      
      if (options.search) {
        console.log(`🔍 Searching for pattern: ${options.search}`);
        searchResults = await searchInFiles(files, options.search, {
          regex: options.regex,
          caseSensitive: options.caseSensitive,
          contextLines: options.context || 0,
          highlightMatches: true
        });
        
        const stats = generateSearchStats(searchResults, options.search);
        console.log(`✅ Found ${stats.totalMatches} matches in ${stats.totalFiles} files`);
      }

      if (options.findTodos) {
        console.log('🔍 Searching for TODO patterns...');
        const todoResults = await findCodePatterns(files, {
          contextLines: options.context || 2
        });
        
        console.log('📋 TODO Pattern Results:');
        Object.entries(todoResults).forEach(([pattern, data]) => {
          if (data.results.length > 0) {
            console.log(`  ${pattern.toUpperCase()}: ${data.stats.totalMatches} matches in ${data.stats.totalFiles} files`);
          }
        });
        
        // Store results for output
        searchResults = todoResults;
      }

      if (options.findFunctions) {
        console.log('🔍 Searching for function patterns...');
        const functionResults = await findFunctionPatterns(files, {
          contextLines: options.context || 1
        });
        
        console.log('📋 Function Pattern Results:');
        functionResults.forEach(pattern => {
          if (pattern.results.length > 0) {
            console.log(`  ${pattern.name}: ${pattern.stats.totalMatches} matches in ${pattern.stats.totalFiles} files`);
          }
        });
        
        // Store results for output
        searchResults = functionResults;
      }

      // If we have search results and no other output mode, display them
      if (searchResults && !options.output && !options.clipboard && !options.dry) {
        console.log('\n📊 Search Results:');
        console.log('─'.repeat(50));
        
        if (Array.isArray(searchResults)) {
          // Handle search results from searchInFiles
          searchResults.forEach(result => {
            console.log(`\n📄 ${result.filePath} (${result.matchCount} matches):`);
            result.matches.forEach((match, index) => {
              if (index < 10) { // Limit displayed matches
                console.log(`  Line ${match.lineNumber}: ${match.line}`);
                if (match.context) {
                  if (match.context.before.length > 0) {
                    match.context.before.forEach((line, i) => {
                      console.log(`    ${match.lineNumber - match.context.before.length + i}: ${line}`);
                    });
                  }
                  if (match.context.after.length > 0) {
                    match.context.after.forEach((line, i) => {
                      console.log(`    ${match.lineNumber + i + 1}: ${line}`);
                    });
                  }
                }
              }
            });
            if (result.matchCount > 10) {
              console.log(`    ... and ${result.matchCount - 10} more matches`);
            }
          });
        } else if (typeof searchResults === 'object') {
          // Handle results from pattern searches
          Object.entries(searchResults).forEach(([pattern, data]) => {
            if (data.results && data.results.length > 0) {
              console.log(`\n🔍 ${pattern.toUpperCase()} (${data.description}):`);
              data.results.forEach(result => {
                console.log(`  📄 ${result.filePath} (${result.matchCount} matches)`);
                result.matches.slice(0, 5).forEach(match => {
                  console.log(`    Line ${match.lineNumber}: ${match.line}`);
                });
                if (result.matchCount > 5) {
                  console.log(`    ... and ${result.matchCount - 5} more matches`);
                }
              });
            }
          });
        }
        
        console.log('\n🎉 Search complete!');
        return;
      }

      // Analyze file relationships if requested
      let projectAnalysis = null;
      if (options.includeRelationships || options.fileSummaries || options.includeDependencies || 
          options.groupByFeature) {
        console.log('🔗 Analyzing file relationships...');
        
        projectAnalysis = await analyzeProjectRelationships(files);
        console.log(`✅ Analyzed relationships for ${projectAnalysis.stats.analyzedFiles} files`);
        console.log(`   Found ${projectAnalysis.stats.totalImports} imports and ${projectAnalysis.stats.totalExports} exports`);
        
      }
      
      // Determine output file - use default if not specified and not clipboard/dry mode
      let outputFile = options.output;
      if (!outputFile && !options.clipboard && !options.dry) {
        outputFile = 'directory-output.txt';
        console.log(`📄 No output file specified, creating: ${outputFile}`);
      }
      
      // Generate output options
      const generateOptions = {
        dry: options.dry,
        outputFile: outputFile,
        clipboard: options.clipboard,
        markdown: options.markdown,
        format: options.format,
        redact: options.redact,
        concurrency: 10,
        // Relationship analysis options
        includeRelationships: options.includeRelationships,
        fileSummaries: options.fileSummaries,
        includeDependencies: options.includeDependencies,
        groupByFeature: options.groupByFeature,
        projectAnalysis: projectAnalysis
      };
      
      // Generate preview or full output
      if (options.preview) {
        await generatePreview(changedFiles, options.preview, generateOptions);
      } else {
        await generateText(changedFiles, {
          ...generateOptions,
          cache,
          changeInfo,
          highlightNew: options.highlightNew
        });
      }

      // Update cache with processed files
      if (cache) {
        for (const filePath of changedFiles) {
          await cache.updateFileCache(filePath, { processed: true, processedAt: new Date().toISOString() });
        }
        await cache.save();
        
        const stats = cache.getStats();
        console.log(`💾 Cache updated: ${stats.files} files cached`);
      }
      
      console.log('🎉 Generation complete!');
      
    } catch (error) {
      console.error('❌ Error during generation:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      restoreConsoleLog();
      process.exit(1);
    } finally {
      restoreConsoleLog();
    }
}

/**
 * Main run command - generates text output from directory
 */
applyGenerationOptions(
  program
    .command('run')
    .description('Generate text from directory structure and files')
).action((options, command) => runDirectoryGeneration(options, command));

/**
 * Pack command - modern alias for run output generation
 */
applyGenerationOptions(
  program
    .command('pack')
    .description('Pack directory structure and files for LLM context')
).action((options, command) => runDirectoryGeneration(options, command));

/**
 * Config command - creates default configuration
 */
program
  .command('config')
  .description('Create default .dir2txt.json configuration file')
  .option('--show', 'Show current configuration')
  .option('--validate', 'Validate current configuration file')
  .action(async (options) => {
    try {
      if (options.validate) {
        console.log('🔍 Validating configuration file...\n');
        
        try {
          const configPath = path.join(process.cwd(), '.dir2txt.json');
          const configData = await fs.readFile(configPath, 'utf8');
          const config = JSON.parse(configData);
          
          const validation = validateConfigWithSuggestions(config);
          
          if (validation.isValid) {
            console.log('✅ Configuration is valid!');
            if (validation.warnings && validation.warnings.length > 0) {
              console.log(formatValidationErrors([], validation.warnings));
            }
          } else {
            console.log('❌ Configuration has errors:');
            console.log(formatValidationErrors(validation.errors, validation.warnings));
            
            if (validation.suggestions.length > 0) {
              console.log('💡 Suggestions:');
              validation.suggestions.forEach(suggestion => console.log(`   ${suggestion}`));
            }
            
            console.log('\n🔧 Sanitized configuration would be:');
            console.log(JSON.stringify(validation.sanitized, null, 2));
          }
        } catch (error) {
          if (error.code === 'ENOENT') {
            console.log('📋 No configuration file found. Run "dir2txt config" to create one.');
          } else if (error instanceof SyntaxError) {
            console.error('❌ Invalid JSON in .dir2txt.json:');
            console.error(`   ${error.message}`);
          } else {
            console.error(`❌ Error reading config: ${error.message}`);
          }
        }
        return;
      }
      
      if (options.show) {
        const config = await loadConfig();
        if (Object.keys(config).length === 0) {
          console.log('📋 No configuration file found. Default settings:');
          console.log(JSON.stringify(getDefaultConfig(), null, 2));
        } else {
          console.log('📋 Current configuration:');
          console.log(JSON.stringify(config, null, 2));
        }
        return;
      }
      
      await createDefaultConfig();
      console.log('✅ Created default configuration file');
      
    } catch (error) {
      console.error('❌ Error creating config:', error.message);
      process.exit(1);
    }
  });

/**
 * Update command - modifies existing configuration
 */
program
  .command('update')
  .description('Update configuration settings')
  .option('--add <pattern>', 'Add ignore pattern')
  .option('--remove <pattern>', 'Remove ignore pattern')
  .option('--max-size <bytes>', 'Set maximum file size', parseInt)
  .option('--add-ext <extension>', 'Add file extension to include')
  .option('--remove-ext <extension>', 'Remove file extension from include list')
  .action(async (options) => {
    try {
      const currentConfig = await loadConfig();
      const updates = {};
      
      // Handle ignore patterns
      if (options.add || options.remove) {
        const ignorePatterns = [...(currentConfig.ignorePatterns || [])];
        
        if (options.add) {
          if (!ignorePatterns.includes(options.add)) {
            ignorePatterns.push(options.add);
            console.log(`➕ Added ignore pattern: ${options.add}`);
          } else {
            console.log(`⚠️  Pattern already exists: ${options.add}`);
          }
        }
        
        if (options.remove) {
          const index = ignorePatterns.indexOf(options.remove);
          if (index !== -1) {
            ignorePatterns.splice(index, 1);
            console.log(`➖ Removed ignore pattern: ${options.remove}`);
          } else {
            console.log(`⚠️  Pattern not found: ${options.remove}`);
          }
        }
        
        updates.ignorePatterns = ignorePatterns;
      }
      
      // Handle file extensions
      if (options.addExt || options.removeExt) {
        const extensions = [...(currentConfig.includeExtensions || [])];
        
        if (options.addExt) {
          const ext = options.addExt.startsWith('.') ? options.addExt : '.' + options.addExt;
          if (!extensions.includes(ext)) {
            extensions.push(ext);
            console.log(`➕ Added extension: ${ext}`);
          } else {
            console.log(`⚠️  Extension already exists: ${ext}`);
          }
        }
        
        if (options.removeExt) {
          const ext = options.removeExt.startsWith('.') ? options.removeExt : '.' + options.removeExt;
          const index = extensions.indexOf(ext);
          if (index !== -1) {
            extensions.splice(index, 1);
            console.log(`➖ Removed extension: ${ext}`);
          } else {
            console.log(`⚠️  Extension not found: ${ext}`);
          }
        }
        
        updates.includeExtensions = extensions;
      }
      
      // Handle max file size
      if (options.maxSize !== undefined) {
        updates.maxFileSize = options.maxSize;
        console.log(`📏 Set max file size: ${options.maxSize} bytes`);
      }
      
      // Apply updates if any were made
      if (Object.keys(updates).length > 0) {
        await updateConfig(updates);
        console.log('✅ Configuration updated successfully');
      } else {
        console.log('ℹ️  No changes specified');
        console.log('Use --help to see available update options');
      }
      
    } catch (error) {
      console.error('❌ Error updating config:', error.message);
      process.exit(1);
    }
  });

/**
 * Delete command - removes configuration file
 */
program
  .command('delete')
  .description('Delete .dir2txt.json configuration file')
  .option('--force', 'Skip confirmation prompt')
  .action(async (options) => {
    try {
      if (!options.force) {
        // Simple confirmation (in a real app you might use inquirer)
        console.log('⚠️  This will delete the .dir2txt.json configuration file');
        console.log('Use --force to skip this confirmation');
        return;
      }
      
      await deleteConfig();
      console.log('✅ Configuration file deleted');
      
    } catch (error) {
      console.error('❌ Error deleting config:', error.message);
      process.exit(1);
    }
  });

/**
 * Templates command - shows or applies common project templates
 */
program
  .command('templates')
  .description('Show or apply common project ignore templates')
  .option('--list', 'List available templates')
  .option('--apply <template>', 'Apply a template to current config')
  .action(async (options) => {
    try {
      const templates = {
        node: {
          name: 'Node.js',
          ignorePatterns: ['node_modules/**', 'dist/**', 'build/**', '*.log', '.env*', 'coverage/**'],
          includeExtensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.md']
        },
        python: {
          name: 'Python',
          ignorePatterns: ['__pycache__/**', '*.pyc', '*.pyo', 'venv/**', '.venv/**', 'dist/**', '*.egg-info/**'],
          includeExtensions: ['.py', '.pyx', '.pyi', '.txt', '.md', '.yaml', '.yml', '.json']
        },
        java: {
          name: 'Java',
          ignorePatterns: ['target/**', 'build/**', '*.class', '*.jar', '*.war', '.gradle/**'],
          includeExtensions: ['.java', '.kt', '.scala', '.xml', '.properties', '.md']
        },
        web: {
          name: 'Web Frontend',
          ignorePatterns: ['node_modules/**', 'dist/**', 'build/**', '.next/**', '.nuxt/**', 'public/build/**'],
          includeExtensions: ['.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte', '.html', '.css', '.scss', '.json']
        },
        cpp: {
          name: 'C/C++',
          ignorePatterns: ['build/**', 'cmake-build-*/**', '*.o', '*.obj', '*.exe', '*.out', '*.a', '*.so'],
          includeExtensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.cmake', '.md']
        }
      };
      
      if (options.list) {
        console.log('📋 Available templates:');
        Object.entries(templates).forEach(([key, template]) => {
          console.log(`  ${key.padEnd(8)} - ${template.name}`);
        });
        console.log('\nUsage: dir2txt templates --apply <template>');
        return;
      }
      
      if (options.apply) {
        const template = templates[options.apply];
        if (!template) {
          console.error(`❌ Unknown template: ${options.apply}`);
          console.log('Use --list to see available templates');
          process.exit(1);
        }
        
        console.log(`📋 Applying ${template.name} template...`);
        await updateConfig({
          ignorePatterns: template.ignorePatterns,
          includeExtensions: template.includeExtensions
        });
        console.log(`✅ Applied ${template.name} template successfully`);
        return;
      }
      
      // Show help if no options
      console.log('📋 Project Templates');
      console.log('Use --list to see available templates');
      console.log('Use --apply <template> to apply a template');
      
    } catch (error) {
      console.error('❌ Error with templates:', error.message);
      process.exit(1);
    }
  });

/**
 * Status command - shows current directory info
 */
program
  .command('status')
  .description('Show current directory status and configuration')
  .action(async () => {
    try {
      console.log('📊 Directory Status:');
      console.log(`   Working Directory: ${process.cwd()}`);
      
      const config = await loadConfig();
      if (Object.keys(config).length > 0) {
        console.log('   Configuration: .dir2txt.json found');
        console.log(`   Ignore Patterns: ${config.ignorePatterns?.length || 0}`);
        console.log(`   Include Extensions: ${config.includeExtensions?.length || 0}`);
        console.log(`   Max File Size: ${config.maxFileSize || 'not set'}`);
      } else {
        console.log('   Configuration: Using defaults (.gitignore or built-in)');
      }
      
      // Quick file count
      const files = await getFiles({ excludeLarge: false });
      console.log(`   Total Files: ${files.length}`);
      
    } catch (error) {
      console.error('❌ Error getting status:', error.message);
      process.exit(1);
    }
  });

/**
 * Interactive command - starts interactive mode
 */
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode with guided interface')
  .action(async () => {
    try {
      await startInteractiveMode();
    } catch (error) {
      console.error('❌ Error in interactive mode:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Watch command - monitors directory for changes and regenerates output
 */
program
  .command('watch')
  .alias('w')
  .description('Watch directory for changes and automatically regenerate output')
  .option('--output <file>', 'Output file to write (auto-updates on changes)')
  .option('--clipboard', 'Automatically copy output to clipboard on changes')
  .option('--debounce <delay>', 'Debounce delay (e.g., "500ms", "2s", "1000")', '1000ms')
  .option('--ignore-temp', 'Ignore temporary and build files (uses smart defaults)')
  .option('--smart-diff', 'Only regenerate when meaningful changes occur')
  .option('--silent', 'Suppress non-error output')
  .option('--extensions <ext...>', 'Only watch files with these extensions')
  .option('--max-depth <depth>', 'Maximum directory depth to watch', parseInt)
  .option('--max-size <bytes>', 'Maximum file size to include', parseInt)
  .option('--markdown', 'Output in markdown format')
  .option('--incremental', 'Use incremental processing (faster for large projects)', true)
  .option('--cache-dir <path>', 'Cache directory path (default: .dir2txt-cache)')
  .option('--show-changes', 'Show what files changed on each update')
  .action(async (options) => {
    try {
      console.log('🚀 Starting dir2txt watch mode...');
      
      // Parse debounce option
      let debounceDelay;
      try {
        debounceDelay = parseDebounceOption(options.debounce);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
      }
      
      // Validate output options
      if (!options.output && !options.clipboard) {
        console.log('💡 No output method specified. Use --output <file> or --clipboard');
        console.log('   Defaulting to stdout (will print updates to terminal)');
      }
      
      // Prepare watch options
      const watchOptions = {
        debounce: debounceDelay,
        clipboard: options.clipboard,
        outputFile: options.output,
        silent: options.silent,
        smartDiff: options.smartDiff,
        incremental: options.incremental,
        extensions: options.extensions,
        maxDepth: options.maxDepth,
        maxFileSize: options.maxSize,
        markdown: options.markdown,
        ignorePatterns: options.ignoreTemp ? [] : undefined, // Use smart defaults if ignoreTemp is enabled
        cacheDir: options.cacheDir,
        showChanges: options.showChanges
      };
      
      // Start watching
      const stopWatching = await startWatchMode(process.cwd(), watchOptions);
      
      // Handle graceful shutdown
      const cleanup = async () => {
        console.log('\n🛑 Shutting down watch mode...');
        await stopWatching();
        console.log('✅ Watch mode stopped');
        process.exit(0);
      };
      
      // Listen for shutdown signals
      process.on('SIGINT', cleanup);  // Ctrl+C
      process.on('SIGTERM', cleanup); // Kill signal
      process.on('SIGHUP', cleanup);  // Hangup signal
      
      // Keep the process alive
      console.log('👀 Watch mode active. Press Ctrl+C to stop.');
      console.log(`⚙️  Debounce delay: ${debounceDelay}ms`);
      if (options.clipboard) console.log('📋 Auto-copy to clipboard: enabled');
      if (options.output) console.log(`📄 Output file: ${options.output}`);
      
    } catch (error) {
      console.error('❌ Error starting watch mode:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Handle unknown commands
program.on('command:*', function (operands) {
  console.error(`❌ Unknown command: ${operands[0]}`);
  console.log('💡 Use --help to see available commands');
  process.exit(1);
});

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

/**
 * Cache management command
 */
program
  .command('cache')
  .description('Manage incremental processing cache')
  .option('--clear', 'Clear the cache')
  .option('--stats', 'Show cache statistics')
  .option('--cache-dir <path>', 'Cache directory path (default: .dir2txt-cache)')
  .action(async (options) => {
    try {
      const { createCache } = await import('../lib/cache.js');
      const cache = await createCache({
        cacheDir: options.cacheDir,
        enabled: true
      });

      if (options.clear) {
        await cache.clear();
        console.log('✅ Cache cleared successfully');
        return;
      }

      if (options.stats) {
        const stats = cache.getStats();
        console.log('📊 Cache Statistics:');
        console.log(`   Cache Directory: ${stats.cacheDir}`);
        console.log(`   Enabled: ${stats.enabled}`);
        console.log(`   Cached Files: ${stats.files}`);
        console.log(`   Snapshots: ${stats.snapshots}`);
        console.log(`   Relationships: ${stats.relationships}`);
        return;
      }

      // Default: show cache info
      const stats = cache.getStats();
      console.log('📦 Cache Information:');
      console.log(`   Directory: ${stats.cacheDir}`);
      console.log(`   Status: ${stats.enabled ? '✅ Enabled' : '❌ Disabled'}`);
      console.log(`   Files: ${stats.files}`);
      console.log('');
      console.log('Available commands:');
      console.log('   dir2txt cache --stats    # Show detailed statistics');
      console.log('   dir2txt cache --clear    # Clear all cached data');

    } catch (error) {
      console.error('❌ Cache error:', error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.DEBUG) {
    console.error(reason.stack);
  }
  process.exit(1);
});

/**
 * Beautiful welcome screen for new users
 */
function showWelcome() {
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│             ██████╗ ██╗██████╗ ██████╗ ████████╗██╗  ██╗████████╗           │
│             ██╔══██╗██║██╔══██╗╚════██╗╚══██╔══╝╚██╗██╔╝╚══██╔══╝           │
│             ██║  ██║██║██████╔╝ █████╔╝   ██║    ╚███╔╝    ██║              │
│             ██║  ██║██║██╔══██╗██╔═══╝    ██║    ██╔██╗    ██║              │
│             ██████╔╝██║██║  ██║███████╗   ██║   ██╔╝ ██╗   ██║              │
│             ╚═════╝ ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝              │
│                                                                             │
│                  Convert directories to LLM-friendly text                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

📚 QUICK START:

  Basic usage:
    dir2txt run                     # Generate text to directory-output.txt
    dir2txt run --clipboard         # Copy output to clipboard
    dir2txt run --dry               # Show file tree only (no file created)
    dir2txt run --markdown          # Output in markdown format

  🔗 SMART RELATIONSHIPS (NEW!):
    dir2txt run --include-relationships --file-summaries --clipboard
    dir2txt run --include-dependencies --group-by-feature --output smart.txt
    dir2txt run --file-summaries --markdown
    dir2txt run --include-relationships --include-dependencies --clipboard

  Configuration:
    dir2txt config                  # Create default configuration
    dir2txt templates --list        # Show project templates
    dir2txt templates --apply node  # Apply Node.js template

  Interactive mode:
    dir2txt interactive             # Start guided interactive mode
    dir2txt i                       # Short alias for interactive mode

  Examples:
    dir2txt run --extensions .js .ts --output code.txt
    dir2txt run --ignore "*.test.js" --clipboard
    dir2txt run --preview 5 --markdown
    dir2txt run --search "TODO|FIXME" --context 3
    dir2txt run --find-todos --output todos.txt
    dir2txt run --since "2024-01-01" --content-filter "async"

📖 COMMON USE CASES:

  🤖 For LLM Analysis:   dir2txt run --include-relationships --file-summaries --clipboard
  📝 For Documentation:  dir2txt run --markdown --file-summaries --output docs/code.md
  🔍 Quick Preview:      dir2txt run --dry --preview 10
  📋 Copy to ChatGPT:    dir2txt run --clipboard --include-relationships --ignore "test/**"
  🐛 Find Tech Debt:     dir2txt run --find-todos --output tech-debt.txt
  🔎 Code Review:        dir2txt run --since "2024-01-01" --search "async"
  📊 Pattern Analysis:   dir2txt run --include-dependencies --group-by-feature --clipboard
  🕸️  Understand Deps:   dir2txt run --include-dependencies --file-summaries --output deps.txt
  🚀 Fast Processing:    dir2txt run --incremental --show-changes --clipboard
  📦 Watch Changes:      dir2txt watch --incremental --show-changes --clipboard

🔗 RELATIONSHIP FEATURES:
  
    --include-relationships      # Show imports/exports between files
    --file-summaries            # Add pattern-based file purpose descriptions  
    --include-dependencies      # Display dependency graph and file relationships
    --group-by-feature          # Group files by functionality instead of directory

⚡ INCREMENTAL PROCESSING:
  
    --incremental               # Only process changed files (faster for large projects)
    --cache-dir <path>          # Custom cache directory (default: .dir2txt-cache)
    --show-changes              # Show what files changed since last run
    --highlight-new             # Highlight new files in output
    --clear-cache               # Clear cache before processing

💡 HELP:

    dir2txt --help          # Show all commands
    dir2txt <command> --help # Show command-specific help
    dir2txt status          # Show current directory status

🚀 Get started with: dir2txt interactive (guided mode) or dir2txt run --include-relationships --file-summaries --clipboard
`);
}

// If no command provided, show welcome screen
if (process.argv.length <= 2) {
  showWelcome();
} else {
  // Parse command line arguments
  program.parse();
}
