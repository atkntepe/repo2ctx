# repo2ctx

Prepare safe, task-focused repository context for AI coding agents.

> Formerly `dir2txt`. The `dir2txt` binary remains available as a compatibility alias.

## ✨ Key Features

### 🚀 **Core Functionality**
- **LLM-Optimized Output**: Clean, structured text perfect for AI analysis
- **Multiple Output Formats**: Plain text, Markdown with syntax highlighting
- **Flexible File Discovery**: Smart scanning with configurable ignore patterns
- **Binary File Detection**: Automatically skips binary files and images  
- **Size Filtering**: Configurable file size limits to avoid huge files
- **Performance Optimized**: Concurrent processing with timing metrics

### 🔗 **Smart Relationship Analysis**
- **Import/Export Tracking**: Analyze dependencies between files
- **File Summaries**: Pattern-based file purpose identification
- **Dependency Graphs**: Visualize project structure and relationships
- **Functional Grouping**: Organize files by functionality instead of directories

### ⚡ **Incremental Processing & Caching**
- **Lightning Fast Updates**: Only process changed files on subsequent runs
- **Smart Change Detection**: SHA256-based content comparison with mtime optimization
- **Watch Mode Integration**: Real-time updates with minimal processing overhead
- **Cache Management**: Built-in cache statistics and cleanup tools
- **Perfect for Large Projects**: Massive speed improvements for repeated analysis

### 🎮 **Interactive Experience**
- **Interactive Mode**: Guided interface for exploring your project
- **Live File Browser**: Navigate and analyze files interactively
- **Real-time Search**: Find patterns across your codebase instantly
- **Project Statistics**: Detailed analysis and metrics
- **Watch Mode**: Auto-regenerate output when files change

### 🛠️ **Advanced Search & Filtering**
- **Content Search**: Find patterns within file contents with regex support
- **Date Filtering**: Process only files modified within specific time ranges
- **TODO/FIXME Detection**: Automatically find technical debt markers
- **Function Pattern Matching**: Extract function definitions across languages
- **Context-Aware Results**: Show surrounding lines for search matches

### 📋 **Project Management**
- **Project Templates**: Pre-configured settings for Node.js, Python, Java, Web, C++
- **Flexible Configuration**: JSON config files with inheritance
- **Template System**: Quick setup for common project types

## 📦 Installation

### Global Installation (Recommended)
```bash
npm install -g repo2ctx
```

### Local Installation
```bash
npm install repo2ctx
npx repo2ctx --help
```

## 🏃 Quick Start

```bash
repo2ctx pack --dry
repo2ctx pack --format markdown --output repo-context.md
dir2txt run --dry
```

Upcoming pivot workflow commands: `brief`, `map`, `context`, and `agents`.

### Basic Usage
```bash
# Generate text to directory-output.txt (default)
repo2ctx run

# Copy directly to clipboard for AI tools
repo2ctx run --clipboard

# Only show directory structure (no file content)
repo2ctx run --dry

# Generate in markdown format  
repo2ctx run --markdown --output docs/codebase.md
```

### Smart Analysis Features
```bash
# Include file relationships and summaries
dir2txt run --include-relationships --file-summaries --clipboard

# Show dependency graph and group by functionality
dir2txt run --include-dependencies --group-by-feature --output analysis.txt

# Fast incremental processing (only changed files)
dir2txt run --incremental --show-changes --clipboard
```

### Interactive Mode
```bash
# Start interactive mode with guided interface
dir2txt interactive

# Quick alias
dir2txt i
```

### Watch Mode (Live Updates)
```bash
# Watch for changes and auto-update
dir2txt watch --clipboard

# Watch with change analysis (incremental by default)
dir2txt watch --show-changes --output live.txt
```

## ⚡ Incremental Processing

Perfect for large projects and active development:

```bash
# First run: processes all files, builds cache
dir2txt run --incremental --clipboard

# Subsequent runs: only processes changed files (lightning fast!)
dir2txt run --incremental --show-changes

# Clear cache and start fresh
dir2txt run --clear-cache --incremental

# Check cache statistics
dir2txt cache --stats

# Manual cache management
dir2txt cache --clear
```

## 🔍 Advanced Search & Analysis

### Content Search
```bash
# Search for patterns in file contents
dir2txt run --search "TODO|FIXME" --context 3

# Find all TODO/FIXME comments
dir2txt run --find-todos --output tech-debt.txt

# Regex search with case sensitivity
dir2txt run --search "async.*function" --regex --case-sensitive
```

### Date-Based Filtering
```bash
# Files modified since specific date
dir2txt run --since "2024-01-01" --clipboard

# Files modified in date range
dir2txt run --since "2024-01-01" --before "2024-02-01"

# Recent changes with search
dir2txt run --since "2024-01-01" --search "async" --context 2
```

### Function Analysis
```bash
# Extract function definitions
dir2txt run --find-functions --output functions.txt

# Combine with content filtering
dir2txt run --content-filter "async" --find-functions
```

## ⚙️ Configuration

### Create Default Config
```bash
dir2txt config
```

This creates `.dir2txt.json` with intelligent defaults:

```json
{
  "ignorePatterns": [
    "node_modules/**",
    "dist/**", 
    "build/**",
    "coverage/**",
    ".dir2txt-cache/**"
  ],
  "includeExtensions": [
    ".js", ".ts", ".jsx", ".tsx",
    ".json", ".md", ".py", ".java",
    ".css", ".html", ".vue", ".svelte"
  ],
  "maxFileSize": 1048576,
  "concurrency": 10,
  "excludeLarge": true
}
```

### Dynamic Configuration Updates
```bash
# Add/remove ignore patterns
dir2txt update --add "*.test.js" --add "docs/**"
dir2txt update --remove "dist/**"

# Manage file extensions
dir2txt update --add-ext .go --add-ext .rs
dir2txt update --remove-ext .xml

# Update settings
dir2txt update --max-size 2097152
dir2txt config --show
```

### Project Templates
```bash
# List available templates
dir2txt templates --list

# Apply template for your project type
dir2txt templates --apply node    # Node.js/TypeScript
dir2txt templates --apply python  # Python
dir2txt templates --apply web     # Web Frontend
dir2txt templates --apply java    # Java
dir2txt templates --apply cpp     # C/C++
```

## 📋 Complete Command Reference

| Command | Description | Key Options |
|---------|-------------|-------------|
| `run` | Generate text output | `--incremental`, `--include-relationships`, `--file-summaries`, `--clipboard`, `--dry`, `--markdown` |
| `interactive` | Interactive mode | Guided interface with all features |
| `watch` | Live file watching | `--incremental` (default), `--show-changes`, `--clipboard`, `--output` |
| `cache` | Cache management | `--stats`, `--clear` |
| `config` | Configuration | `--show` |
| `update` | Update config | `--add`, `--remove`, `--add-ext`, `--remove-ext` |
| `templates` | Project templates | `--list`, `--apply` |
| `status` | Directory status | Show current directory and config status |

## 📖 Output Examples

### With Relationship Analysis
```
=== PROJECT ANALYSIS ===

Total Files Analyzed: 45
Total Imports: 127
Total Exports: 89

=== FILE CONTENTS ===

--- src/components/Button.jsx ---
Purpose: Component module - Button
Imports: react, ./styles.css, ../utils/helpers
Language: javascript

import React from 'react';
import './styles.css';
import { formatLabel } from '../utils/helpers';

export const Button = ({ label, onClick, variant = 'primary' }) => {
  return (
    <button 
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {formatLabel(label)}
    </button>
  );
};
```

### Incremental Processing Output
```
🔍 Starting dir2txt...
📦 Cache initialized at: .dir2txt-cache
📁 Scanning directory...
✅ Found 156 files

📊 Change Analysis:
   📄 Total files: 156
   🔄 Changed: 3
   ✨ New: 1  
   🗑️  Deleted: 0
   📝 New files: src/components/Modal.jsx

🚀 Processing 3 changed files
💾 Cache updated: 156 files cached
🎉 Generation complete!
```

## 🎯 Common Use Cases

### For AI/LLM Analysis
```bash
# Complete codebase with context
dir2txt run --include-relationships --file-summaries --clipboard

# Fast incremental updates during development
dir2txt run --incremental --show-changes --clipboard

# Focus on specific functionality
dir2txt run --group-by-feature --include-dependencies --output analysis.txt
```

### For Documentation
```bash
# Project structure overview
dir2txt run --dry --markdown > project-structure.md

# Comprehensive code documentation
dir2txt run --markdown --include-relationships --file-summaries --output docs/codebase.md

# API documentation focus
dir2txt run --search "export.*function|export.*class" --context 5 --markdown
```

### For Code Review & Analysis
```bash
# Recent changes analysis
dir2txt run --since "2024-01-01" --include-relationships --output recent-changes.txt

# Technical debt analysis
dir2txt run --find-todos --find-functions --output tech-debt-analysis.txt

# Dependency analysis
dir2txt run --include-dependencies --group-by-feature --markdown
```

### For Active Development
```bash
# Live development with watch mode
dir2txt watch --incremental --show-changes --clipboard

# Interactive exploration
dir2txt interactive

# Quick previews
dir2txt run --preview 10 --include-relationships
```

## 🏗️ Architecture

```
dir2txt/
├── bin/cli.js              # CLI entry point and commands
├── lib/
│   ├── config.js           # Configuration management
│   ├── traverse.js         # Directory traversal and filtering  
│   ├── generate.js         # Text generation and formatting
│   ├── relationships.js    # Import/export analysis & file summaries
│   ├── search.js          # Content search and pattern matching
│   ├── interactive.js     # Interactive mode interface
│   ├── watcher.js         # File watching and live updates
│   ├── cache.js           # Incremental processing and caching
│   └── validation.js      # Configuration validation
└── test/                  # Comprehensive test suite
```

## 📊 Performance

### Speed Optimizations
- **Incremental Processing**: 10-100x faster on subsequent runs
- **Concurrent Processing**: Configurable parallelism (default: 10 files)
- **Smart Caching**: SHA256-based change detection with mtime optimization
- **Efficient Scanning**: Fast-glob for optimal file discovery
- **Memory Efficient**: Streaming output for large projects

### Benchmarks
- **First Run**: ~100-500ms for typical projects
- **Incremental Run**: ~10-50ms (only changed files)
- **Watch Mode**: ~5-20ms updates (near-instantaneous)
- **Large Projects**: 500+ files processed in <2 seconds

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup
```bash
git clone https://github.com/yourusername/dir2txt.git
cd dir2txt
npm install

# Run tests
npm test

# Test locally
node bin/cli.js run --dry
node bin/cli.js interactive
```

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [fast-glob](https://github.com/mrmlnc/fast-glob) - Fast and efficient glob matching
- [chokidar](https://github.com/paulmillr/chokidar) - Efficient file watching
- [ignore](https://github.com/kaelzhang/node-ignore) - .gitignore parsing
- [commander](https://github.com/tj/commander.js) - Command-line interface framework
- [clipboardy](https://github.com/sindresorhus/clipboardy) - Cross-platform clipboard access

---

**Made with ❤️ for developers and AI enthusiasts**

*Transform your codebase into AI-friendly text with intelligent analysis, lightning-fast incremental processing, and comprehensive project insights.*
