# @usetessera/mcp

MCP server that exposes your codebase architecture to AI coding agents via the [Model Context Protocol](https://modelcontextprotocol.io).

Works with **Claude Code**, **Cursor**, and any MCP-compatible AI agent.

## What it does

Tessera uses `architecture.md` files in your folder structure to describe your system's architecture following the C4 model (Context, Container, Component, Module). This MCP server gives your AI agent full read/write access to that architecture, enabling it to:

- Understand your codebase structure before making changes
- Create and update architectural documentation as it writes code
- Validate documentation freshness against git history
- Generate Mermaid diagrams from architectural context
- Scaffold architecture files for existing codebases

## Getting Started (new project)

After installing the MCP, tell your agent:

> "Call `bootstrap_tessera_project` to initialize Tessera in this project."

That single tool orchestrates the full setup: it proposes a C4 layer mapping for your existing folder structure, guides you through questions to confirm your goals and session context, and writes the `.tessera-protocols/` records and `architecture.md` files. Once done, every subsequent session starts by calling `get_session_gate` — which returns your active goals, current session context, and a live validation digest in one read-only call.

## Installation

```bash
npm install -g @usetessera/mcp
```

## Configuration

### Claude Code

Add to your Claude Code MCP settings (`.claude/settings.json` or global):

```json
{
  "mcpServers": {
    "tessera": {
      "command": "tessera-mcp",
      "args": []
    }
  }
}
```

### Cursor

Add to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "tessera": {
      "command": "npx",
      "args": ["@usetessera/mcp"]
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP configuration (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "tessera": {
      "command": "npx",
      "args": ["-y", "@usetessera/mcp"]
    }
  }
}
```

### Default project root

Every tool takes an optional `rootPath` argument. When omitted, the server falls back to a default resolved at startup, in this precedence:

1. `--root <path>` (or `--root=<path>`) argv
2. `TESSERA_ROOT` environment variable
3. `process.cwd()`

This means you usually don't have to pass `rootPath` at all — the agent can just call `get_architecture_tree` and the server knows which project you mean.

Pin the server to a specific project via argv:

```json
{
  "mcpServers": {
    "tessera": {
      "command": "tessera-mcp",
      "args": ["--root", "/absolute/path/to/project"]
    }
  }
}
```

Or via env:

```json
{
  "mcpServers": {
    "tessera": {
      "command": "tessera-mcp",
      "env": { "TESSERA_ROOT": "/absolute/path/to/project" }
    }
  }
}
```

If neither is set, the server operates on whatever directory the MCP client launches it from.

## Available Tools (34 tools across 9 categories)

### Read
- **`get_architecture_tree`** — Returns the full architecture tree as JSON
- **`get_element`** — Reads a single element's architecture.md
- **`search_elements`** — Search elements by name, tag, or description
- **`get_element_for_file`** — Reverse-looks up the owning architecture element for any source file

### Write
- **`create_element`** — Creates a new folder with a templated architecture.md
- **`update_element`** — Replaces an element's architecture.md content

### Context
- **`get_rules`** — Reads the project's AI agent rules (`.tessera/agent-rules.md`)
- **`get_element_context`** — Returns an element with its parent, siblings, and children

### Validation
- **`validate_staleness`** — Uses git to find elements where code changed after the architecture.md
- **`find_orphans`** — Finds folders with code files but no architecture.md
- **`check_links`** — Validates that dependency links in architecture.md files resolve
- **`find_mixed_layers`** — Finds elements whose children span multiple layer types (enforces the uniform children rule)
- **`validate_files`** — Reports modules where on-disk files diverge from the `## Files` section in architecture.md

### Diagrams
- **`prepare_diagram_context`** — Assembles context for generating Mermaid diagrams
- **`save_diagram`** — Writes a `.mermaid.md` file for an element
- **`list_diagram_types`** — Returns available diagram types for a given layer
- **`list_diagrams`** — Lists existing `.mermaid.md` files for an element

### Docs
- **`compile_docs`** — Renders all `.mermaid.md` diagrams to SVG in a `docs/` folder with an index catalog
- **`check_diagram_staleness`** — Reports which diagram SVGs are stale or missing compared to their sources

### Scaffolding
- **`scaffold_existing_codebase`** — Analyzes folder structure and proposes C4 layer mapping
- **`apply_scaffold`** — Creates architecture.md files from scaffold proposals

### Protocols
- **`get_session_gate`** — THE session gate: returns the active goals, current session context, a live validation digest, and the gate instructions in one read-only call (agents should call it first, every session)
- **`prepare_agent_gate_configs`** — Emits per-agent gate config snippets (CLAUDE.md, AGENTS.md, Cursor rules, generic AGENT.md); files are written only after user confirmation
- **`prepare_protocol_bootstrap`** — Inspects protocol setup and returns guided bootstrap questions for the agent to ask the user
- **`apply_protocol_bootstrap`** — Creates `.tessera-protocols/` baseline files from explicit user-confirmed answers

### Workflows
- **`review_architecture_drift`** — Combines validation results into a prioritized documentation update plan
- **`update_stale_documentation`** — Drafts stale/drifted documentation updates and can apply deterministic `## Files` synchronization
- **`apply_documentation_updates`** — Applies exact reviewed `architecture.md` replacement content
- **`prepare_architecture_pr_summary`** — Summarizes architecture impact from current Git changes
- **`bootstrap_tessera_project`** — Orchestrates architecture scaffold proposal and protocol bootstrap preparation
- **`suggest_architecture_improvements`** — Finds modeling, metadata, dependency, and drift improvements
- **`generate_architecture_diagram`** — Generates Mermaid diagram specs from architecture metadata
- **`generate_system_map`** — Generates a workspace/system map from the architecture tree
- **`validate_release_readiness`** — Checks package/spec metadata and build artifacts before release

## Requirements

- **Node.js** ≥ 18.0.0
- **Git** — required for `validate_staleness` (git-based documentation freshness checks)
- **@mermaid-js/mermaid-cli** *(external optional tool)* — required only for `compile_docs` diagram rendering. Install with `npm install -g @mermaid-js/mermaid-cli` if needed.

## VS Code Extension

For a visual architecture canvas, install the Tessera VS Code extension from the VS Code Marketplace.

## Design notes

A few things worth knowing if you're peeking under the hood:

- **Git-based staleness.** `validate_staleness` and `check_diagram_staleness` use `git log` (via `simple-git`) to compare commit dates of code vs. their `architecture.md`. This is slower than filesystem `mtime` but immune to false positives from branch switches, checkouts, or no-op editor saves. Git is therefore a hard runtime requirement — without it, staleness tools fall back gracefully but lose accuracy.
- **Bundled output.** `npm run build` runs esbuild and produces a single self-contained `dist/index.js`. Internal type packages are inlined at build time, so the published tarball ships only `dist/` + `README.md` + `LICENSE` and has no internal workspace dependencies.
- **External Mermaid CLI.** The `compile_docs` tool shells out to `@mermaid-js/mermaid-cli` for SVG rendering. It is not bundled with the MCP package because the headless-Chromium dependency is large and platform-sensitive; the tool reports a clear error if it's invoked without `mmdc` available.

## License

MIT — see [LICENSE](./LICENSE).
