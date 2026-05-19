import { promises as fs } from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import { redactFileContent } from './output/redact.js';
import { renderSection } from './output/renderers.js';
import { formatTokenEstimate } from './output/tokens.js';

const STRUCTURED_FORMATS = new Set(['json', 'xml']);

/**
 * Common binary file extensions to skip
 */
const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.ico', '.webp',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.app',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.class', '.jar', '.war', '.ear',
  '.pyc', '.pyo', '.o', '.obj', '.lib', '.a'
]);

/**
 * Checks if a file is likely binary based on extension
 * @param {string} filePath - Path to the file
 * @returns {boolean} True if file is likely binary
 */
function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Checks if file content contains binary data by sampling first chunk
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} True if file appears to be binary
 */
async function containsBinaryContent(filePath) {
  try {
    // Read first 8KB to check for binary content
    const buffer = Buffer.alloc(8192);
    const fileHandle = await fs.open(filePath, 'r');
    const { bytesRead } = await fileHandle.read(buffer, 0, 8192, 0);
    await fileHandle.close();
    
    if (bytesRead === 0) return false;
    
    // Check for null bytes (common in binary files)
    const sample = buffer.subarray(0, bytesRead);
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return true;
    }
    
    // Check for high percentage of non-printable characters
    let nonPrintable = 0;
    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];
      // Allow common whitespace characters
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintable++;
      }
    }
    
    // If more than 30% is non-printable, consider it binary
    return (nonPrintable / sample.length) > 0.3;
  } catch (error) {
    // If we can't read it, assume it might be binary
    return true;
  }
}

/**
 * Generates an ASCII tree structure from file paths
 * @param {string[]} filePaths - Array of file paths
 * @returns {string} ASCII tree representation
 */
export function generateFileTree(filePaths) {
  if (filePaths.length === 0) {
    return 'No files found.\n';
  }
  
  // Build a tree structure
  const tree = {};
  
  // Process each file path
  filePaths.forEach(filePath => {
    const parts = filePath.split(path.sep);
    let current = tree;
    
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = index === parts.length - 1 ? null : {};
      }
      if (current[part] !== null) {
        current = current[part];
      }
    });
  });
  
  // Convert tree to ASCII representation
  function buildTreeString(node, prefix = '', isLast = true) {
    let result = '';
    const entries = Object.entries(node);
    
    entries.forEach(([name, children], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? '└── ' : '├── ';
      
      result += prefix + connector + name + '\n';
      
      if (children !== null) {
        const newPrefix = prefix + (isLastEntry ? '    ' : '│   ');
        result += buildTreeString(children, newPrefix, isLastEntry);
      }
    });
    
    return result;
  }
  
  let treeString = 'Project Structure:\n';
  treeString += buildTreeString(tree);
  return treeString;
}

/**
 * Limits concurrent async operations
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {number} limit - Maximum concurrent operations
 * @returns {Promise<Array>} Results array
 */
async function limitConcurrency(items, processor, limit = 10) {
  const results = [];
  
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchPromises = batch.map(processor);
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

function logOutput(options, message) {
  if (options._structuredLogsToStderr) {
    process.stderr.write(`${message}\n`);
    return;
  }
  console.log(message);
}

async function readFilePayload(filePath, options = {}) {
  if (isBinaryFile(filePath)) {
    logOutput(options, `Skipping binary file: ${filePath}`);
    return {
      path: filePath,
      content: '',
      skipped: true,
      reason: 'binary file'
    };
  }

  if (await containsBinaryContent(filePath)) {
    logOutput(options, `Skipping binary content: ${filePath}`);
    return {
      path: filePath,
      content: '',
      skipped: true,
      reason: 'binary content'
    };
  }

  const rawContent = await fs.readFile(filePath, 'utf8');
  const content = redactFileContent(filePath, rawContent, { redact: options.redact });

  return {
    path: filePath,
    content,
    skipped: false
  };
}

function getRelationshipMetadata(filePath, options = {}) {
  const analysis = options.projectAnalysis?.relationships?.get(filePath);
  const dependencies = options.projectAnalysis?.dependencyGraph?.get(filePath);
  if (!analysis || !(options.fileSummaries || options.includeRelationships || options.includeDependencies)) {
    return null;
  }

  const metadata = {};

  if (options.fileSummaries && analysis.summary) {
    metadata.summary = analysis.summary;
  }

  if (options.includeRelationships) {
    if (analysis.imports.length > 0) {
      metadata.imports = analysis.imports.map(imp => imp.path);
    }
    if (analysis.exports.length > 0) {
      metadata.exports = analysis.exports.map(exp => exp.name);
    }
  }

  if (options.includeDependencies && dependencies) {
    if (dependencies.dependencies.length > 0) {
      metadata.dependencies = dependencies.dependencies;
    }
    if (dependencies.dependents.length > 0) {
      metadata.dependents = dependencies.dependents;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function formatRelationshipContext(metadata) {
  if (!metadata) return '';

  const contextParts = [];

  if (metadata.summary) {
    contextParts.push(`Purpose: ${metadata.summary}`);
  }

  if (metadata.imports?.length > 0) {
    const importPaths = metadata.imports.slice(0, 5);
    contextParts.push(`Imports: ${importPaths.join(', ')}${metadata.imports.length > 5 ? ' (+' + (metadata.imports.length - 5) + ' more)' : ''}`);
  }

  if (metadata.exports?.length > 0) {
    const exportNames = metadata.exports.slice(0, 5);
    contextParts.push(`Exports: ${exportNames.join(', ')}${metadata.exports.length > 5 ? ' (+' + (metadata.exports.length - 5) + ' more)' : ''}`);
  }

  if (metadata.dependencies?.length > 0) {
    const depNames = metadata.dependencies.map(dep => path.basename(dep)).slice(0, 3);
    contextParts.push(`Dependencies: ${depNames.join(', ')}${metadata.dependencies.length > 3 ? ' (+' + (metadata.dependencies.length - 3) + ' more)' : ''}`);
  }

  if (metadata.dependents?.length > 0) {
    const depNames = metadata.dependents.map(dep => path.basename(dep)).slice(0, 3);
    contextParts.push(`Used by: ${depNames.join(', ')}${metadata.dependents.length > 3 ? ' (+' + (metadata.dependents.length - 3) + ' more)' : ''}`);
  }

  return contextParts.length > 0 ? contextParts.join('\n') + '\n\n' : '';
}

function escapeXmlValue(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indentJson(value, spaces = 2) {
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map(line => ' '.repeat(spaces) + line)
    .join('\n');
}

async function buildAnalysisPayload(options) {
  const payload = {};

  if (options.includeDependencies && options.projectAnalysis) {
    const { generateDependencyGraph } = await import('./relationships.js');
    payload.dependencyGraph = generateDependencyGraph(
      options.projectAnalysis.relationships,
      options.projectAnalysis.dependencyGraph
    );
  }

  if (options.projectAnalysis && options.fileSummaries) {
    payload.projectAnalysis = {
      totalFilesAnalyzed: options.projectAnalysis.stats.analyzedFiles,
      totalImports: options.projectAnalysis.stats.totalImports,
      totalExports: options.projectAnalysis.stats.totalExports
    };
  }

  return payload;
}

function renderXmlFile(file) {
  const attrs = [
    `path="${escapeXmlValue(file.path)}"`,
    file.skipped ? 'skipped="true"' : null,
    file.reason ? `reason="${escapeXmlValue(file.reason)}"` : null
  ].filter(Boolean).join(' ');

  if (file.skipped) {
    return `    <file ${attrs} />\n`;
  }

  let output = `    <file ${attrs}>\n`;

  if (file.relationships) {
    output += '      <relationships>\n';
    if (file.relationships.summary) {
      output += `        <summary>${escapeXmlValue(file.relationships.summary)}</summary>\n`;
    }
    for (const importPath of file.relationships.imports || []) {
      output += `        <import>${escapeXmlValue(importPath)}</import>\n`;
    }
    for (const exportName of file.relationships.exports || []) {
      output += `        <export>${escapeXmlValue(exportName)}</export>\n`;
    }
    for (const dependency of file.relationships.dependencies || []) {
      output += `        <dependency>${escapeXmlValue(dependency)}</dependency>\n`;
    }
    for (const dependent of file.relationships.dependents || []) {
      output += `        <dependent>${escapeXmlValue(dependent)}</dependent>\n`;
    }
    output += '      </relationships>\n';
  }

  output += `      <content>${escapeXmlValue(file.content)}</content>\n`;
  output += '    </file>\n';
  return output;
}

async function writeJsonStructuredOutput(filePaths, options, startTime) {
  const tree = generateFileTree(filePaths);
  let processedCount = 0;
  let skippedCount = 0;
  const analysisPayload = await buildAnalysisPayload(options);

  await writeOutput('{\n', options);
  await writeOutput(`  "tree": ${JSON.stringify(tree)},\n`, options);
  if (analysisPayload.dependencyGraph !== undefined) {
    await writeOutput(`  "dependencyGraph": ${JSON.stringify(analysisPayload.dependencyGraph)},\n`, options);
  }
  if (analysisPayload.projectAnalysis !== undefined) {
    await writeOutput(`  "projectAnalysis": ${JSON.stringify(analysisPayload.projectAnalysis)},\n`, options);
  }
  await writeOutput('  "files": [\n', options);

  if (!options.dry) {
    logOutput(options, '📖 Reading file contents...');

    for (const filePath of filePaths) {
      const payload = await readFilePayload(filePath, options);
      const relationships = getRelationshipMetadata(filePath, options);
      if (relationships) {
        payload.relationships = relationships;
      }
      if (payload.skipped) {
        skippedCount++;
      } else {
        processedCount++;
      }
      await writeOutput(`${processedCount + skippedCount > 1 ? ',\n' : ''}${indentJson(payload, 4)}`, options);
    }
  }

  const totalTime = Date.now() - startTime;
  const summary = {
    totalFiles: filePaths.length,
    processed: processedCount,
    skipped: skippedCount,
    estimatedSize: formatTokenEstimate({ length: options._writtenChars || 0 }),
    totalTimeMs: totalTime,
  };

  await writeOutput('\n  ],\n', options);
  await writeOutput(`  "summary": ${JSON.stringify(summary, null, 2).split('\n').join('\n  ')}\n`, options);
  await writeOutput('}\n', options);

  return {
    processedCount,
    skippedCount,
    totalTime
  };
}

async function writeXmlStructuredOutput(filePaths, options, startTime) {
  const tree = generateFileTree(filePaths);
  let processedCount = 0;
  let skippedCount = 0;
  const analysisPayload = await buildAnalysisPayload(options);

  await writeOutput('<repo2ctx>\n', options);
  await writeOutput(`  <tree>${escapeXmlValue(tree)}</tree>\n`, options);

  if (analysisPayload.dependencyGraph !== undefined) {
    await writeOutput(`  <dependencyGraph>${escapeXmlValue(analysisPayload.dependencyGraph)}</dependencyGraph>\n`, options);
  }

  if (analysisPayload.projectAnalysis !== undefined) {
    const stats = analysisPayload.projectAnalysis;
    await writeOutput(`  <projectAnalysis totalFilesAnalyzed="${stats.totalFilesAnalyzed}" totalImports="${stats.totalImports}" totalExports="${stats.totalExports}" />\n`, options);
  }

  await writeOutput('  <files>\n', options);

  if (!options.dry) {
    logOutput(options, '📖 Reading file contents...');

    for (const filePath of filePaths) {
      const payload = await readFilePayload(filePath, options);
      const relationships = getRelationshipMetadata(filePath, options);
      if (relationships) {
        payload.relationships = relationships;
      }
      if (payload.skipped) {
        skippedCount++;
      } else {
        processedCount++;
      }
      await writeOutput(renderXmlFile(payload), options);
    }
  }

  const totalTime = Date.now() - startTime;
  const estimatedSize = formatTokenEstimate({ length: options._writtenChars || 0 });

  await writeOutput('  </files>\n', options);
  await writeOutput(`  <summary totalFiles="${filePaths.length}" processed="${processedCount}" skipped="${skippedCount}" estimatedSize="${escapeXmlValue(estimatedSize)}" totalTimeMs="${totalTime}" />\n`, options);
  await writeOutput('</repo2ctx>\n', options);

  return {
    processedCount,
    skippedCount,
    totalTime
  };
}

async function writeStructuredOutput(filePaths, options, startTime) {
  return options.format === 'xml'
    ? writeXmlStructuredOutput(filePaths, options, startTime)
    : writeJsonStructuredOutput(filePaths, options, startTime);
}

/**
 * Reads a single file and returns formatted content
 * @param {string} filePath - Path to the file
 * @param {Object} options - Formatting options
 * @returns {Promise<string|null>} Formatted file content or null if skipped
 */
async function readFileContent(filePath, options = {}) {
  try {
    const payload = await readFilePayload(filePath, options);
    if (payload.skipped) {
      return null;
    }
    const content = payload.content;
    
    const relationshipContext = formatRelationshipContext(getRelationshipMetadata(filePath, options));
    
    const format = options.format || (options.markdown ? 'markdown' : 'text');

    if (format === 'json' || format === 'xml') {
      const sectionContent = relationshipContext ? relationshipContext + content : content;
      return renderSection('file', sectionContent, {
        format,
        attributes: { path: filePath }
      });
    }

    // Format the content with delimiter
    const delimiter = format === 'markdown'
      ? `\n## ${filePath}\n\n${relationshipContext ? relationshipContext : ''}\`\`\`${getLanguageFromExtension(filePath)}\n`
      : `\n--- ${filePath} ---\n${relationshipContext}`;
    
    const endDelimiter = format === 'markdown' ? '\n```\n' : '\n';
    
    return delimiter + content + endDelimiter;
  } catch (error) {
    console.warn(`Warning: Cannot read file ${filePath}: ${error.message}`);
    return `\n--- ${filePath} ---\n[Error: ${error.message}]\n`;
  }
}

/**
 * Gets language identifier for markdown code blocks
 * @param {string} filePath - Path to the file
 * @returns {string} Language identifier
 */
export function getLanguageFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap = {
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.html': 'html',
    '.xml': 'xml',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'zsh',
    '.fish': 'fish',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin'
  };
  
  return languageMap[ext] || '';
}

/**
 * Writes content to output stream (stdout, file, or clipboard buffer)
 * @param {string} content - Content to write
 * @param {Object} options - Output options
 */
async function writeOutput(content, options = {}) {
  options._writtenChars = (options._writtenChars || 0) + content.length;

  if (options.clipboard) {
    // For clipboard mode, we'll collect all content in a buffer
    if (!options._clipboardBuffer) {
      options._clipboardBuffer = '';
    }
    options._clipboardBuffer += content;
  } else if (options.outputFile) {
    try {
      await fs.appendFile(options.outputFile, content, 'utf8');
    } catch (error) {
      console.error(`Error writing to file ${options.outputFile}: ${error.message}`);
      throw error;
    }
  } else {
    process.stdout.write(content);
  }
}

/**
 * Finalizes clipboard output by writing to system clipboard
 * @param {Object} options - Options containing clipboard buffer
 */
async function finalizeClipboardOutput(options) {
  if (options.clipboard && options._clipboardBuffer) {
    try {
      // Normalize line endings for clipboard compatibility
      const clipboardText = options._clipboardBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Use async version for better reliability
      await clipboardy.write(clipboardText);
      console.log(`📋 Copied ${clipboardText.length} characters to clipboard`);
    } catch (error) {
      console.error(`❌ Error copying to clipboard: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Generates text output from file paths with optional streaming
 * @param {string[]} filePaths - Array of file paths to process
 * @param {Object} options - Generation options
 * @param {boolean} [options.dry=false] - Only generate tree, no file contents
 * @param {string} [options.outputFile] - Write to file instead of stdout
 * @param {boolean} [options.markdown=false] - Use markdown formatting
 * @param {number} [options.concurrency=10] - Maximum concurrent file reads
 * @returns {Promise<void>}
 */
export async function generateText(filePaths, options = {}) {
  const {
    dry = false,
    outputFile,
    clipboard = false,
    markdown = false,
    format = markdown ? 'markdown' : 'text',
    concurrency = 10
  } = options;
  options.format = format;
  options.markdown = format === 'markdown';
  options._structuredLogsToStderr = STRUCTURED_FORMATS.has(format);
  
  const startTime = Date.now();
  logOutput(options, `📝 Processing ${filePaths.length} files...`);
  
  // Clear output file if specified
  if (outputFile) {
    try {
      await fs.writeFile(outputFile, '', 'utf8');
      logOutput(options, `📄 Output will be written to: ${outputFile}`);
    } catch (error) {
      console.error(`❌ Error creating output file: ${error.message}`);
      throw error;
    }
  }

  // Handle edge case: empty file list
  if (filePaths.length === 0) {
    logOutput(options, '⚠️  No files to process');
    if (STRUCTURED_FORMATS.has(format)) {
      await writeStructuredOutput(filePaths, options, startTime);
      await finalizeClipboardOutput(options);
    } else {
      await writeOutput('No files found to process.\n', options);
    }
    return;
  }

  if (STRUCTURED_FORMATS.has(format)) {
    const { processedCount, skippedCount, totalTime } = await writeStructuredOutput(filePaths, options, startTime);

    if (dry) {
      logOutput(options, `Dry run complete. Generated tree for ${filePaths.length} files.`);
      await finalizeClipboardOutput(options);
      return;
    }

    await finalizeClipboardOutput(options);

    logOutput(options, `\n🎉 Generation complete!`);
    logOutput(options, `📊 Files processed: ${processedCount}`);
    logOutput(options, `⏭️  Files skipped: ${skippedCount}`);
    logOutput(options, `⏱️  Total time: ${totalTime}ms`);

    if (outputFile) {
      logOutput(options, `💾 Output saved to: ${outputFile}`);
    }
    return;
  }
  
  // Generate and write file tree
  const treeHeader = format === 'markdown' ? '# Project Structure\n\n```\n' : '';
  const treeFooter = format === 'markdown' ? '```\n\n' : '\n';
  const fileTree = treeHeader + generateFileTree(filePaths) + treeFooter;
  
  await writeOutput(fileTree, options);
  
  // If dry run, stop here
  if (dry) {
    console.log(`Dry run complete. Generated tree for ${filePaths.length} files.`);
    await finalizeClipboardOutput(options);
    return;
  }
  
  // Add dependency graph if requested
  if (options.includeDependencies && options.projectAnalysis) {
    const { generateDependencyGraph } = await import('./relationships.js');
    const depGraph = generateDependencyGraph(
      options.projectAnalysis.relationships, 
      options.projectAnalysis.dependencyGraph
    );
    
    const depHeader = format === 'markdown' ? '# Dependency Graph\n\n```\n' : '=== DEPENDENCY GRAPH ===\n\n';
    const depFooter = format === 'markdown' ? '```\n\n' : '\n\n';
    await writeOutput(depHeader + depGraph + depFooter, options);
  }

  // Add project analysis summary if available
  if (options.projectAnalysis && options.fileSummaries) {
    const stats = options.projectAnalysis.stats;
    const summaryHeader = format === 'markdown' ? '# Project Analysis\n\n' : '=== PROJECT ANALYSIS ===\n\n';
    let summary = `Total Files Analyzed: ${stats.analyzedFiles}\n`;
    summary += `Total Imports: ${stats.totalImports}\n`;
    summary += `Total Exports: ${stats.totalExports}\n`;
    
    await writeOutput(summaryHeader + summary + '\n', options);
  }

  // Add content section header
  const contentHeader = format === 'markdown' ? '# File Contents\n\n' : '=== FILE CONTENTS ===\n\n';
  await writeOutput(contentHeader, options);
  
  // Group files by feature if requested
  let fileGroups;
  if (options.groupByFeature && options.projectAnalysis) {
    const { groupFilesByFunction } = await import('./relationships.js');
    fileGroups = groupFilesByFunction(
      options.projectAnalysis.relationships, 
      options.projectAnalysis.dependencyGraph
    );
    console.log(`📂 Grouped files into ${fileGroups.size} categories`);
  }

  // Process files with limited concurrency
  const contentStartTime = Date.now();
  console.log('📖 Reading file contents...');
  let processedCount = 0;
  let skippedCount = 0;
  
  const processor = async (filePath) => {
    const content = await readFileContent(filePath, options);
    if (content !== null) {
      await writeOutput(content, options);
      processedCount++;
    } else {
      skippedCount++;
    }
    
    // Progress indicator
    if ((processedCount + skippedCount) % 10 === 0) {
      console.log(`Processed ${processedCount + skippedCount}/${filePaths.length} files...`);
    }
  };

  // Process files either grouped or sequentially
  if (fileGroups) {
    for (const [groupName, groupFiles] of fileGroups) {
      const groupHeader = format === 'markdown' ? `\n### ${groupName}\n\n` : `\n=== ${groupName.toUpperCase()} ===\n\n`;
      await writeOutput(groupHeader, options);
      
      const groupFilePaths = Array.from(groupFiles);
      await limitConcurrency(groupFilePaths, processor, concurrency);
    }
  } else {
    await limitConcurrency(filePaths, processor, concurrency);
  }
  
  const contentTime = Date.now() - contentStartTime;
  const totalTime = Date.now() - startTime;
  const estimatedSize = formatTokenEstimate({ length: options._writtenChars || 0 });
  
  // Final summary
  const summary = `\n=== SUMMARY ===\n` +
                 `Total files: ${filePaths.length}\n` +
                 `Processed: ${processedCount}\n` +
                 `Skipped: ${skippedCount}\n` +
                 `Estimated size: ${estimatedSize}\n` +
                 `Content processing time: ${contentTime}ms\n` +
                 `Total time: ${totalTime}ms\n`;
  
  await writeOutput(summary, options);
  
  // Finalize clipboard output if needed
  await finalizeClipboardOutput(options);
  
  console.log(`\n🎉 Generation complete!`);
  console.log(`📊 Files processed: ${processedCount}`);
  console.log(`⏭️  Files skipped: ${skippedCount}`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  
  if (outputFile) {
    console.log(`💾 Output saved to: ${outputFile}`);
  }
}

/**
 * Generates a quick preview with just the file tree and first few files
 * @param {string[]} filePaths - Array of file paths
 * @param {number} [previewCount=5] - Number of files to preview
 * @param {Object} [options={}] - Generation options
 * @returns {Promise<void>}
 */
export async function generatePreview(filePaths, previewCount = 5, options = {}) {
  console.log(`Generating preview with first ${previewCount} files...`);
  
  // Generate tree for all files
  const fileTree = generateFileTree(filePaths);
  await writeOutput(`Preview - Project Structure:\n${fileTree}\n`, options);
  
  // Show preview of first few files
  const previewFiles = filePaths.slice(0, previewCount);
  await writeOutput(`=== PREVIEW (First ${previewCount} files) ===\n\n`, options);
  
  for (const filePath of previewFiles) {
    const content = await readFileContent(filePath, options);
    if (content !== null) {
      await writeOutput(content, options);
    }
  }
  
  if (filePaths.length > previewCount) {
    await writeOutput(`\n... and ${filePaths.length - previewCount} more files\n`, options);
  }
  
  // Finalize clipboard output if needed
  await finalizeClipboardOutput(options);
}
