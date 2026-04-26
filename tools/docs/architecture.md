# Docs Tools

## Overview
MCP tool implementations for compiling architecture diagrams into a centralized `docs/` output folder. Handles rendering `.mermaid.md` source files to SVG via `@mermaid-js/mermaid-cli` (mmdc), organizing output in a tree-mirroring folder structure, generating an index catalog, and checking diagram staleness (source newer than rendered output).

## Files
- `docs.ts` — Registers `compile_docs` and `check_diagram_staleness` MCP tools

## Functions
- `registerDocsTools(server: McpServer): void` — Registers all docs compilation tools with the MCP server instance; thin wrapper over the handler functions below
- `handleCompileDocs({ rootPath, force? }): Promise<CompileDocsResult>` — Pure handler for `compile_docs`; returns a discriminated union with `kind: "mmdc-missing"` when the CLI is not installed, otherwise `kind: "success"` with compilation details
- `handleCheckDiagramStaleness({ rootPath }): Promise<CheckDiagramStalenessResult>` — Pure handler for `check_diagram_staleness`

### Registered MCP Tools
- `compile_docs` — Takes `rootPath`, optional `force`. Walks the architecture tree, finds all `.mermaid.md` files, renders them to SVG in `docs/`, copies source markdown alongside, and generates `docs/index.md` catalog. Skips up-to-date outputs unless `force` is true.
- `check_diagram_staleness` — Takes `rootPath`. Compares `.mermaid.md` source mtimes against their rendered SVG counterparts in `docs/`. Reports stale, missing, and up-to-date counts.

### Internal Functions
- `findMmdc(rootPath): Promise<string | null>` — Locates the mmdc binary from local or global install; exported so tests can verify the lookup order
- `collectDiagramSources(rootPath): Promise<DiagramSource[]>` — Walks the tree to find all `.mermaid.md` files; exported
- `extractMermaidCode(markdown): string | null` — Extracts mermaid syntax from markdown code block; exported
- `renderDiagramToSvg(mmdcPath, code, outputPath): Promise<void>` — Renders a single diagram via mmdc CLI
- `generateIndexMd(compiled, rootPath): string` — Generates the `docs/index.md` catalog content

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, docs, compilation, mermaid, svg, rendering]
- **Depends on**: [../../core/tree/architecture.md](../../core/tree/architecture.md), [../../core/config/architecture.md](../../core/config/architecture.md), [../../core/drift/architecture.md](../../core/drift/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Renders via `mmdc` CLI (child process) rather than programmatic Mermaid API — simpler, same output quality, avoids browser dependencies in the MCP process
- `@mermaid-js/mermaid-cli` is an optional dependency — docs tools return a clear error with install instructions if mmdc is not found
- `docs/` mirrors the architecture tree folder structure so paths are predictable
- Source `.mermaid.md` files are copied into `docs/` alongside rendered SVGs for reference
- Staleness uses filesystem mtime comparison, consistent with the validation staleness approach
- `docs/` is added to the default ignore patterns so it doesn't appear as an architectural element
