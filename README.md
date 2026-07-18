# repo2ctx

[![npm version](https://img.shields.io/npm/v/repo2ctx.svg)](https://www.npmjs.com/package/repo2ctx)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

Prepare safe, focused repository context for AI coding agents.

`repo2ctx` scans a local repository and produces compact briefs, navigation maps,
task-oriented file shortlists, agent guidance, or complete context packs. It is
designed for the moment before you ask an AI agent to implement, debug, review,
or plan work in an unfamiliar codebase.

The project was previously published as `dir2txt`. The new package still installs
a `dir2txt` command so existing scripts can keep working after migration.

## Why repo2ctx?

- **Start small:** inspect a brief or map before sending full file contents.
- **Focus by task:** identify likely source, test, and configuration files from a
  plain-language task description.
- **Keep code local:** repository scanning and output generation run on your
  machine without an AI API.
- **Reduce accidental exposure:** common secrets are redacted and sensitive or
  noisy paths are filtered by default.
- **Support agent workflows:** generate an `AGENTS.md` file from detected project
  metadata and scripts.
- **Preserve existing usage:** `dir2txt` and `run` remain available as compatibility
  aliases.

## Requirements

- Node.js 20 or newer

## Installation

Install the CLI globally:

```bash
npm install --global repo2ctx
repo2ctx --version
```

Or run it without a global installation:

```bash
npx repo2ctx brief
```

Run commands from the root of the repository you want to inspect.

## Quick start

```bash
# Get a compact overview of the project
repo2ctx brief

# See important files grouped by role
repo2ctx map

# Find files likely to matter for a specific task
repo2ctx context "fix watcher tests"

# Preview generated agent guidance without writing a file
repo2ctx agents --dry

# Create a reviewable Markdown context pack with file contents
repo2ctx pack --format markdown --output repo-context.md
```

Start with `brief`, move to `map` or `context` when you need direction, and use
`pack` only when the agent needs file contents.

## Commands

| Command | What it produces |
| --- | --- |
| `brief` | Project metadata, detected languages, scripts, tests, and key files. |
| `map` | A compact file list grouped into source, tests, configuration, documentation, and other roles. Classification is heuristic. |
| `context <task>` | A repository brief plus a shortlist of likely relevant files and the reason each file was selected. It does not include file contents. |
| `agents` | An `AGENTS.md` file based on detected project facts. Add `--claude` to also create a `CLAUDE.md` wrapper. |
| `pack` | Directory structure and file contents in text, Markdown, JSON, or XML. |
| `run` | Compatibility alias for the original directory-to-text workflow. |

Use `repo2ctx <command> --help` to see every option for a command.

### Write compact outputs to a file

`brief`, `map`, and `context` print to standard output by default. Pass `--output`
to write the result instead:

```bash
repo2ctx brief --output repo-brief.md
repo2ctx map --output repo-map.md
repo2ctx context "review authentication flow" --output task-context.md
```

### Generate agent guidance

```bash
# Preview AGENTS.md
repo2ctx agents --dry

# Write AGENTS.md
repo2ctx agents

# Write AGENTS.md and a CLAUDE.md wrapper
repo2ctx agents --claude
```

The command will not overwrite an existing `AGENTS.md` or `CLAUDE.md` unless you
pass `--force`. Review generated guidance before committing it; `repo2ctx` reports
detected facts but cannot infer every project convention.

## Context packs

`pack` is the full-content command. When neither `--output`, `--clipboard`, nor
`--dry` is supplied, it writes `directory-output.txt` in the current directory.

```bash
# Show the file tree without file contents
repo2ctx pack --dry

# Write Markdown, JSON, or XML
repo2ctx pack --format markdown --output repo-context.md
repo2ctx pack --format json --output repo-context.json
repo2ctx pack --format xml --output repo-context.xml

# Copy generated context to the clipboard
repo2ctx pack --clipboard

# Include only selected file extensions
repo2ctx pack --extensions .js .md .json --output repo-context.txt

# Add ignore rules for this run
repo2ctx pack --ignore "test/**" "dist/**" --output repo-context.txt

# Search file contents with surrounding context
repo2ctx pack --search "TODO|FIXME" --regex --context 3

# Limit files by modification date
repo2ctx pack --since "2026-05-01" --output recent-context.txt
```

Useful pack options include:

| Option | Purpose |
| --- | --- |
| `--dry` | Print only the directory tree. |
| `--output <file>` | Write output to a file. |
| `--clipboard` | Copy output to the clipboard. |
| `--format <format>` | Select `text`, `markdown`, `json`, or `xml`. |
| `--extensions <ext...>` | Include only the listed extensions. |
| `--ignore <patterns...>` | Add ignore patterns for the current run. |
| `--max-size <bytes>` | Skip files above the supplied size. |
| `--max-depth <depth>` | Limit directory traversal depth. |
| `--search <pattern>` | Search within files instead of producing a full pack when no output target is set. |
| `--since <date>` / `--before <date>` | Filter files by modification date. |
| `--include-relationships` | Add heuristic import and export relationships. |
| `--file-summaries` | Add pattern-based file-purpose summaries. |

Relationship analysis and file summaries are heuristic. Treat them as navigation
hints, not as a substitute for language-aware static analysis.

## Safety defaults

`repo2ctx` processes repositories locally. Before content is emitted, it applies
the following safeguards:

- Secret-like assignments such as API keys, tokens, passwords, private keys, and
  database URLs are replaced with redaction markers.
- Sensitive files such as dotenv files, private SSH keys, PEM files, and `.key`
  files are replaced with clear redaction markers if encountered.
- Common heavy or unsafe paths such as `node_modules/**` and `.git/**` are skipped.
- Large files and binary content are filtered during normal traversal.

Always review generated output before sharing it outside your machine. Pattern-based
redaction reduces risk, but it cannot guarantee that every sensitive value will be
recognized.

## Configuration

`repo2ctx` continues to use `.dir2txt.json` so existing configuration files remain
compatible.

```bash
# Create the default configuration file
repo2ctx config

# Show or validate the current configuration
repo2ctx config --show
repo2ctx config --validate

# Show repository and configuration status
repo2ctx status

# Update ignore patterns or extension filters
repo2ctx update --add "tmp/**"
repo2ctx update --remove "dist/**"
repo2ctx update --add-ext .go
repo2ctx update --remove-ext .xml

# List or apply built-in ignore templates
repo2ctx templates --list
repo2ctx templates --apply node
```

Pass `--noconfig` to `pack` or `run` when you want to ignore `.dir2txt.json` for
one invocation.

## Migrating from dir2txt

The npm package moved from `dir2txt` to `repo2ctx`. Replace the old global package:

```bash
npm uninstall --global dir2txt
npm install --global repo2ctx
```

After installing `repo2ctx`, both command names work:

```bash
repo2ctx pack --dry
dir2txt run --dry
```

Existing `.dir2txt.json` files and common `dir2txt run` options remain supported.
Use `repo2ctx` for new scripts and documentation.

## Development

```bash
git clone https://github.com/atkntepe/repo2ctx.git
cd repo2ctx
npm install
npm test
node bin/cli.js --help
```

## License

[ISC](LICENSE)
