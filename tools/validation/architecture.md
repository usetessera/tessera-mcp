# Validation Tools

## Overview
MCP validation tool implementations. These tools check the health and consistency of the architecture documentation: detecting stale architecture.md files (where code is newer than docs), finding orphaned folders (code without documentation), and verifying that dependency links resolve to existing elements.

## Functions (`validation.ts`)
- `registerValidationTools(server: McpServer): void` — Registers all validation tools with the MCP server instance; thin wrapper over the handler functions below
- `handleValidateStaleness({ rootPath }): Promise<ValidateStalenessResult>` — Pure handler for `validate_staleness`
- `handleFindOrphans({ rootPath }): Promise<FindOrphansResult>` — Pure handler for `find_orphans`
- `handleCheckLinks({ rootPath }): Promise<CheckLinksResult>` — Pure handler for `check_links`
- `handleFindMixedLayers({ rootPath }): Promise<FindMixedLayersResult>` — Pure handler for `find_mixed_layers`
- `handleValidateFiles({ rootPath }): Promise<ValidateFilesResult>` — Pure handler for `validate_files`

### Registered MCP Tools
- `validate_staleness` — Takes `rootPath`. Uses a single batched `git log` to build a file→timestamp map, then compares code file dates vs. architecture.md for each element. Returns stale elements with timestamps and separately reports untracked elements (architecture.md not yet committed).
- `find_orphans` — Takes `rootPath`. Walks filesystem to find folders with code files but no architecture.md. Returns paths with suggested C4 layer based on depth.
- `check_links` — Takes `rootPath`. Parses all architecture.md dependsOn/dependedBy links and verifies each resolves to an existing file. Returns broken links.
- `find_mixed_layers` — Takes `rootPath`. Finds elements whose direct children span multiple layer types (e.g., both Components and Modules). Enforces the uniform children rule (ADR-011).
- `validate_files` — Takes `rootPath`. Reports every element whose tracked files diverge from the `## Files` section in architecture.md. Returns undocumented files, missing files, and (for non-Module layers, per ADR-016) files whose description lacks a pinning rationale.

## Classes
- No classes — tool handler functions

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, validation, staleness, orphans, link-checking, mixed-layers, file-drift]
- **Depends on**: [../../core/tree/architecture.md](../../core/tree/architecture.md), [../../core/config/architecture.md](../../core/config/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Staleness uses a single batched git log (authoritative) rather than per-file serial calls for performance
- Untracked elements (architecture.md not committed) are reported separately from stale elements
- find_orphans walks the full tree, not just documented elements
- Link resolution follows the relative markdown link format used in architecture.md
- validate_files reuses the FileInfo merge logic already computed by the tree builder
- Post-ADR-016, validate_files runs on any element with a `## Files` section (not only Modules). Wire-format field names (`totalModules`, `driftedModules`, `modules`) stay the same for backward compat; semantics widen to "elements with file-level tracking."
- Non-Module file entries carry a pinning-rationale expectation. An empty description on a Container/Component file surfaces in `filesMissingPinningRationale` as a soft warning, not a hard failure.
