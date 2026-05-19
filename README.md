# repo2ctx

`repo2ctx` prepares safe, task-focused repository context for AI coding agents.

It helps you give an agent the right amount of local project context before asking
for implementation, debugging, review, or planning work. The default workflow is
compact first: generate a brief, inspect the repo map, then create task-specific
context only when you need more detail.

Formerly `dir2txt`. The `dir2txt` binary remains available as a compatibility
alias, so existing scripts can keep using `dir2txt run`, `dir2txt pack`, and the
other supported commands.

## Install

```bash
npm install -g repo2ctx
```

For local development from this repository:

```bash
npm install
node bin/cli.js --help
```

## Quick Start

Run these from the repository you want to summarize:

```bash
repo2ctx brief
repo2ctx map
repo2ctx context "fix watcher tests"
repo2ctx agents
repo2ctx pack --format markdown --output repo-context.md
```

When working from a checkout of this repository, use `node bin/cli.js` in place
of `repo2ctx`:

```bash
node bin/cli.js brief
node bin/cli.js map
node bin/cli.js context "fix watcher tests"
node bin/cli.js agents --dry
node bin/cli.js pack --format markdown --output repo-context.md
```

## Commands

| Command | Purpose |
| --- | --- |
| `brief` | Print a compact repository brief for AI agents. |
| `map` | Print a compact navigation map of important project files. |
| `context "task"` | Print task-focused context selected for a specific request. |
| `agents` | Generate `AGENTS.md` guidance for coding agents. Use `--dry` to preview it. |
| `pack` | Pack directory structure and file contents for LLM context. |
| `run` | Compatibility command for generating directory and file text output. |

## Safety Defaults

`repo2ctx` is local-first and applies safety defaults before content is emitted:

- Secret-like assignments such as API keys, tokens, passwords, private keys, and
  database URLs are redacted by default.
- Sensitive files such as `.env` files, private SSH keys, PEM files, and `.key`
  files are replaced with redaction markers.
- Common heavy or unsafe paths such as `node_modules/**` and `.git/**` are
  skipped during traversal.

Always review generated output before sharing it outside your machine or pasting
it into an external AI service. Redaction is a safeguard, not a substitute for
human review.

## Typical Workflow

Start with the smallest useful context:

```bash
repo2ctx brief
```

Use the map when an agent needs orientation before editing:

```bash
repo2ctx map
```

Create focused context for a concrete task:

```bash
repo2ctx context "fix watcher tests"
```

Write agent guidance into the repository:

```bash
repo2ctx agents
```

Preview the generated guidance without writing files:

```bash
repo2ctx agents --dry
```

Create a markdown context bundle for review or sharing:

```bash
repo2ctx pack --format markdown --output repo-context.md
```

## Packing Options

`pack` and `run` share the implemented generation options. Useful examples:

```bash
# Show only the file tree, without file contents
repo2ctx pack --dry

# Copy generated context to the clipboard
repo2ctx pack --clipboard

# Limit included file types
repo2ctx pack --extensions .js .md .json

# Add extra ignore patterns for this run
repo2ctx pack --ignore "test/**" "dist/**"

# Search within files and include matching context
repo2ctx pack --search "TODO|FIXME" --context 3

# Include files changed since a date
repo2ctx pack --since "2026-05-01"

# Generate JSON or XML instead of text/markdown
repo2ctx pack --format json --output repo-context.json
repo2ctx pack --format xml --output repo-context.xml
```

The legacy `run` command remains available for existing `dir2txt` usage:

```bash
dir2txt run --dry
dir2txt run --format markdown --output repo-context.md
```

## Configuration

Create a default `.dir2txt.json` configuration:

```bash
repo2ctx config
```

Show current configuration and directory status:

```bash
repo2ctx status
```

Update ignore patterns or extension filters:

```bash
repo2ctx update --add "tmp/**"
repo2ctx update --remove "dist/**"
repo2ctx update --add-ext .go
repo2ctx update --remove-ext .xml
```

List or apply built-in ignore templates:

```bash
repo2ctx templates --list
repo2ctx templates --apply node
```

## Development

```bash
npm install
npm test
node bin/cli.js brief
node bin/cli.js map
node bin/cli.js context "fix watcher tests"
```

## License

ISC
