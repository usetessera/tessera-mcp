# MCP Server

## Overview
The MCP server exposes the Tessera filesystem to AI coding agents via the Model Context Protocol. It provides tools for reading the architecture tree, updating architecture.md files, generating diagrams, validating documentation freshness, and injecting architectural rules into agent context. The server runs locally, requires no external services, and uses the filesystem as the single source of truth. Open source under the MIT license, it serves as the adoption funnel for the VS Code extension — developers install it, start maintaining architecture.md files with their AI agent, and then want the visual tooling.

## Technology
- **Runtime**: Node.js
- **Framework**: TypeScript MCP SDK
- **Git integration**: simple-git (npm) for staleness detection

## Metadata
- **Layer**: Container
- **Tags**: [mcp, server, ai-integration, tools, typescript]
- **Depends on**: [shared](../shared/architecture.md), Local filesystem, Git (for staleness checks)
- **Depended by**: User's AI Agent (Claude Code, Cursor, etc.)
- **Owner**: @jonny
- **Status**: Active

## API Surface (32 tools across 9 categories)
- **Read tools**: `get_architecture_tree`, `get_element`, `search_elements`, `get_element_for_file`
- **Write tools**: `update_element`, `create_element`
- **Context tools**: `get_rules`, `get_element_context`
- **Validation tools**: `validate_staleness` (git-based), `find_orphans`, `check_links`, `find_mixed_layers`, `validate_files`
- **Diagram tools**: `prepare_diagram_context`, `save_diagram`, `list_diagram_types`, `list_diagrams`
- **Docs tools**: `compile_docs`, `check_diagram_staleness`
- **Scaffold tools**: `scaffold_existing_codebase`, `apply_scaffold`
- **Protocol tools**: `prepare_protocol_bootstrap`, `apply_protocol_bootstrap`
- **Workflow tools**: `review_architecture_drift`, `update_stale_documentation`, `apply_documentation_updates`, `prepare_architecture_pr_summary`, `bootstrap_tessera_project`, `suggest_architecture_improvements`, `generate_architecture_diagram`, `generate_system_map`, `validate_release_readiness`

## Deployment
- **Open source under MIT license** — published as a standalone npm package in its own public GitHub repo (see ADR-010)
- `npm install -g @tessera/mcp`
- Configured in the user's AI agent MCP settings (e.g., Claude Code MCP config)
- Runs locally as a subprocess of the AI agent
- Zero operational cost — no tokens, no infrastructure, no API keys

## Key Decisions
- Open source (MIT) as the adoption funnel — every MCP user is a potential extension customer, and open sourcing removes all friction from adoption (see ADR-010)
- No database or server state — filesystem is the single source of truth
- TypeScript for consistency with the extension (see ADR-002)
- Tools organized by category (read, write, context, validation, diagram, docs, scaffold) for clarity
- **Zero runtime dependencies** — esbuild bundles all code (including @tessera/shared, MCP SDK, simple-git, js-yaml, zod) into a single self-contained `dist/index.js`. All packages are devDependencies used only at build time. This eliminates install-time resolution failures and ensures `npm install -g @tessera/mcp` works without access to the monorepo workspace.
