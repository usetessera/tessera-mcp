# Protocol Tools

## Overview
MCP tools for bootstrapping and maintaining Tessera Protocols records. These tools support guided setup of the `.tessera-protocols/` folder by giving the agent a questionnaire and writing user-confirmed baseline records.

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, protocols, bootstrap, alignment]
- **Depends on**: [../../core/architecture.md](../../core/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Files
- `protocols.ts` — Registers protocol bootstrap MCP tools and contains pure handlers for preparing and applying `.tessera-protocols/` initialization.

## Functions
- `handlePrepareProtocolBootstrap(rootPath)` — Inspects the workspace and returns missing protocol files plus a guided question set for the agent to ask the user.
- `handleApplyProtocolBootstrap(args)` — Creates baseline protocol files from explicit user-confirmed bootstrap answers.
- `registerProtocolTools(server, ctx)` — Registers protocol bootstrap tools with the MCP server.

## Classes
- None

## Key Decisions
- Bootstrap is a two-step workflow: prepare questions first, apply confirmed answers second.
- Existing protocol files are skipped by default to avoid silently overwriting user-maintained records.
