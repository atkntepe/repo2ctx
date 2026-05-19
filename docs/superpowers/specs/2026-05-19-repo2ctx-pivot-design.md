# repo2ctx Pivot Design

## Summary

`dir2txt` will pivot from a directory-to-text exporter into `repo2ctx`, a local-first CLI that prepares useful, safe, task-focused context for AI coding agents.

The old behavior remains available as a compatibility path, but the product direction changes from "dump files into text" to "generate the right project context for the AI task."

## Target User

The first target user is a solo developer using AI coding agents on local repositories.

This user wants to:

- Help an AI understand an unfamiliar repo quickly.
- Generate concise context for a specific task.
- Keep agent instructions in the repo.
- Avoid accidentally including secrets, build artifacts, or noisy files.
- Use a simple local CLI without a hosted service.

Team workflows can build on this later, but v1 should optimize for a fast solo-developer loop.

## Product Promise

`repo2ctx` prepares useful, safe, task-focused context for AI coding agents.

The tool should feel like an assistant for shaping repo context, not only a file concatenator.

## CLI Shape

The new primary binary is:

```bash
repo2ctx
```

The old binary remains as a compatibility alias:

```bash
dir2txt
```

Primary commands:

```bash
repo2ctx brief
repo2ctx map
repo2ctx pack
repo2ctx context "fix watcher tests"
repo2ctx agents
```

Compatibility commands:

```bash
dir2txt run
repo2ctx run
```

`pack` is the modern name for the current `run` behavior. `run` stays as an alias so existing users and scripts do not break immediately.

## Commands

### `brief`

Generates a compact repository overview.

The brief should include:

- Project name and package metadata when available.
- Detected package manager, language, runtime, and module type.
- Useful scripts and likely development/test commands.
- Top-level structure.
- Key source, test, config, and documentation files.
- Basic health signals such as missing config, no tests detected, known failing checks when available, oversized files, or suspicious include patterns.

The brief should be concise enough to paste into an agent chat or include at the top of other generated context.

### `map`

Generates a compact navigation map.

The map should include:

- Directory tree.
- Important files grouped by role.
- Exported symbols where cheaply detectable.
- Lightweight dependency hints where reliable.

The map must not overclaim. Regex-based symbol detection is acceptable for v1 when labelled as heuristic. Deep semantic analysis is out of scope for v1.

### `pack`

Modernizes the current full export behavior.

It should include:

- Markdown output.
- XML output.
- JSON output.
- Token estimate.
- Secret redaction enabled by default.
- Better modern ignore defaults.
- Clipboard support without debug artifact files.

The existing `run` command should call the same implementation as `pack`.

### `context "task"`

Generates a task-focused context bundle.

The bundle should include:

- The repo brief.
- Files selected by task text, path matches, symbol/name matches, and simple content search.
- Relevant tests and config files when detected.
- A short explanation of why each major file or group was included.

For v1 this selection can be heuristic. The command should prefer transparent, predictable selection over hidden AI summarization.

### `agents`

Generates project instructions for AI agents.

The primary output is:

```bash
AGENTS.md
```

Optional compatibility output:

```bash
CLAUDE.md
```

The generated instructions should include:

- Project overview.
- Common commands.
- Repo structure.
- Coding and testing notes that can be inferred from the repo.
- Known caveats from the current audit.

The command must not invent conventions that cannot be inferred. It can include clearly marked placeholders only when the user explicitly asks for a starter template; default generated output should avoid placeholders.

## Architecture

The current codebase should be refactored gradually into clearer layers.

Proposed modules:

- `lib/project/`: project detection, package manager detection, scripts, git state, language/runtime metadata.
- `lib/files/`: traversal, ignore handling, binary detection, size filtering.
- `lib/output/`: markdown/xml/json rendering, token estimation, redaction, clipboard/file/stdout output.
- `lib/context/`: brief builder, map builder, task-context builder.
- `lib/agents/`: `AGENTS.md` and `CLAUDE.md` generation.
- `bin/cli.js`: thin command routing and option parsing.

This does not require a full rewrite before shipping. The first implementation phase should create the new module boundaries around existing functions, then move behavior incrementally.

## Compatibility

Backwards compatibility matters because the old package may have users or scripts.

Compatibility requirements:

- Keep `dir2txt` as a binary alias.
- Keep `run` as a command alias for `pack`.
- Keep existing common flags where practical.
- Avoid removing existing behavior in the first pivot release unless it is broken, unsafe, or misleading.

The npm package rename should be handled by publishing a new package named `repo2ctx`. The old `dir2txt` package should either be deprecated with a migration message or turned into a thin compatibility wrapper.

## Quality Bar

Before major feature work, the repo needs a cleanup phase.

Required cleanup:

- Remove clipboard debug file behavior.
- Fix the full test suite.
- Fix, reduce, or remove misleading relationship-analysis behavior and tests.
- Address the production npm audit issue.
- Update dependency versions where low risk.
- Add fixture-based tests for generated outputs.
- Update README around the new identity and command model.

## Non-Goals For v1

The following are explicitly out of scope for the first pivot release:

- Hosted web app.
- Browser extension.
- MCP server.
- Remote GitHub URL ingestion.
- Semantic embeddings.
- Paid AI API summarization.
- Deep AST support for every language.
- Team policy enforcement or CI checks.

These can be considered after the local CLI proves useful.

## Release Shape

The first useful release should be small and coherent:

1. Rename identity to `repo2ctx` while preserving `dir2txt`.
2. Clean test and dependency health.
3. Add `pack` as the modern alias for `run`.
4. Add token estimation and default secret redaction.
5. Add `brief`.
6. Add `map`.
7. Add `agents`.
8. Add the first heuristic `context "task"` command.

The release should prioritize trust, predictable output, and low surprise over advanced intelligence.

## Open Decisions

- Whether to rename the GitHub repository immediately or after the first working `repo2ctx` release.
- Whether the first npm release should be `repo2ctx@1.0.0` or continue the old version line.
- Whether `CLAUDE.md` generation should be enabled by default or only through an option.
- Whether XML output should follow a custom schema or copy a common repo-packer style.

## Success Criteria

The pivot is successful when a solo developer can run:

```bash
repo2ctx brief
repo2ctx map
repo2ctx context "fix a failing test"
repo2ctx agents
```

and get outputs that are concise, safe to share with an AI agent, and more useful than pasting the entire repository.
