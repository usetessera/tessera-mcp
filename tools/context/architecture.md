# Context Tools

## Overview
MCP context and rules tool implementations. These tools inject architectural rules and scoped context into AI agent sessions: returning the project's agent rules and providing a focused summary of an element and its immediate neighbors for targeted agent work.

## Functions (`context.ts`)
- `registerContextTools(server: McpServer): void` — Registers all context/rules tools with the MCP server instance; thin wrapper over the handler functions below
- `handleGetRules({ rootPath }): Promise<string>` — Pure handler for `get_rules`; returns `NO_RULES_MESSAGE` when the file is absent
- `handleGetElementContext({ rootPath, elementPath }): Promise<ElementContext>` — Pure handler for `get_element_context`; throws when the element path does not exist

### Registered MCP Tools
- `get_rules` — Takes `rootPath`, reads `.tessera/agent-rules.md`, returns content as string
- `get_element_context` — Takes `rootPath` + `elementPath`, returns ElementContext (element, parent, siblings, children)

## Classes
- No classes — tool handler functions

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, context, rules, agent-injection]
- **Depends on**: [../../core/tree/architecture.md](../../core/tree/architecture.md), [../../core/config/architecture.md](../../core/config/architecture.md), [../../core/drift/architecture.md](../../core/drift/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md), [../../shared/types/architecture.md](../../shared/types/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Rules are loaded from .tessera/agent-rules.md, not hardcoded — users can customize per project
- Element context includes one level of neighbors (parent + siblings + children) for focused work
