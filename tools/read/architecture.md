# Read Tools

## Overview
MCP read tool implementations. These tools allow AI agents to query the architecture without modifying it: retrieving the full element tree, reading individual element details, and searching across elements by name or content.

## Functions (`read.ts`)
- `registerReadTools(server: McpServer): void` — Registers all read tools with the MCP server instance; thin wrapper over the handler functions below
- `handleGetArchitectureTree({ rootPath }): Promise<ArchitectureTree>` — Pure handler for `get_architecture_tree`
- `handleGetElement({ rootPath, elementPath }): Promise<ParsedArchitectureMd>` — Pure handler for `get_element`; throws when the architecture.md is missing
- `handleSearchElements({ rootPath, query }): Promise<SearchResult[]>` — Pure handler for `search_elements`
- `handleGetElementForFile({ rootPath, filePath }): Promise<GetElementForFileResult | GetElementForFileNotFound>` — Pure handler for `get_element_for_file`

### Registered MCP Tools
- `get_architecture_tree` — Takes `rootPath`, loads config, builds tree, returns full JSON hierarchy
- `get_element` — Takes `rootPath` + `elementPath`, reads and parses the element's architecture.md
- `search_elements` — Takes `rootPath` + `query`, searches element names, tags, and overview text; returns matching SearchResult[]
- `get_element_for_file` — Takes `rootPath` + `filePath`, reverse-looks up the owning architecture element for any source file; returns the element metadata and parsed architecture.md

## Classes
- No classes — tool handler functions registered via MCP SDK

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, read, query, tree, search]
- **Depends on**: [../../core/tree/architecture.md](../../core/tree/architecture.md), [../../core/parser/architecture.md](../../core/parser/architecture.md), [../../core/config/architecture.md](../../core/config/architecture.md), [../../core/drift/architecture.md](../../core/drift/architecture.md), [../../shared/types/architecture.md](../../shared/types/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Each tool function matches a single MCP tool definition (name, schema, handler)
- Handler logic lives in exported `handleX` functions; `registerReadTools` only wires them to the MCP SDK. This keeps handlers testable without the transport (see `tests/read.test.ts`). Pattern applies to all tool categories (ADR-013 Section 1.2).
- Tree is rebuilt per request in MVP (no caching)
