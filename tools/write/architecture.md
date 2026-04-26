# Write Tools

## Overview
MCP write tool implementations. These tools allow AI agents to modify the architecture: updating existing architecture.md files and creating new architectural elements (folder + templated architecture.md).

## Functions (`write.ts`)
- `registerWriteTools(server: McpServer, ctx: ServerContext): void` — Registers all write tools with the MCP server instance; receives `ServerContext` so drift-footer scope can resolve element paths against the default root
- `handleCreateElement({ parentPath, name, layer }): Promise<CreateElementResult>` — Pure handler for `create_element`
- `handleUpdateElement({ elementPath, content }): Promise<UpdateElementResult>` — Pure handler for `update_element`; throws when the target architecture.md does not exist

### Registered MCP Tools
- `create_element` — Takes `parentPath`, `name`, `layer`. Creates folder + templated architecture.md. Returns created path.
- `update_element` — Takes `elementPath`, `content`. Verifies existing file, then replaces architecture.md content.

## Classes
- No classes — tool handler functions

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, write, create, update, mutation]
- **Depends on**: [../../core/templates/architecture.md](../../core/templates/architecture.md), [../../core/config/architecture.md](../../core/config/architecture.md), [../../core/drift/architecture.md](../../core/drift/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Write tools validate that the target path exists (for update) or that the parent exists (for create) before modifying the filesystem
- createElement generates architecture.md from the layer-appropriate template
