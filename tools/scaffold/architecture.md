# Scaffold Tools

## Overview
MCP scaffold tool implementations for existing codebases. Provides a non-destructive workflow to bring an existing project into the Tessera framework: first analyze and propose a C4 mapping, then apply it by creating architecture.md files without moving or renaming any existing code.

## Functions (`scaffold.ts`)
- `registerScaffoldTools(server: McpServer): void` — Registers scaffold tools with the MCP server; thin wrapper over the handler functions below
- `handleScaffoldExistingCodebase({ rootPath }): Promise<ScaffoldProposalResult>` — Pure handler for `scaffold_existing_codebase`
- `handleApplyScaffold({ rootPath, elements }): Promise<ApplyScaffoldResult>` — Pure handler for `apply_scaffold`; per-element failures are collected rather than thrown

### Registered MCP Tools
- `scaffold_existing_codebase` — Takes `rootPath`. Walks the filesystem, analyzes folder depth and contents, proposes C4 layer mapping for each folder. Returns structured JSON with proposals (path, suggestedLayer, suggestedName, reason). Does NOT create files.
- `apply_scaffold` — Takes `rootPath` and array of `{ path, layer, name }` elements. Creates architecture.md files using layer-appropriate templates. Does NOT move/rename existing files. Returns creation results.

## Classes
- No classes — tool handler functions

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, scaffold, initialization, existing-codebase]
- **Depends on**: [../../core/config/architecture.md](../../core/config/architecture.md), [../../core/tree/architecture.md](../../core/tree/architecture.md), [../../core/templates/architecture.md](../../core/templates/architecture.md), [../../core/drift/architecture.md](../../core/drift/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Two-step workflow (propose then apply) — gives user full control, no surprise file creation
- Existing files/folders are never moved or renamed — architecture.md is purely additive
- Layer inference uses depth heuristics: depth 1 → Container, depth 2 → Component, leaf → Module
- Pass-through detection: folders with only subfolders (no code files) or conventionally named wrappers (src/, lib/, app/) are flagged as pass-through candidates and excluded from proposals
