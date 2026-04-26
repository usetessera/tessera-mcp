# Diagram Tools

## Overview
MCP diagram tool implementations. These tools support the supplementary diagram system: assembling context for AI-generated Mermaid diagrams, saving diagram files, listing available diagram types per C4 layer, and scanning for existing diagrams.

## Functions (`diagram.ts`)
- `registerDiagramTools(server: McpServer): void` — Registers all diagram tools with the MCP server instance; thin wrapper over the handler functions below
- `handlePrepareDiagramContext({ rootPath, elementPath, diagramType }): Promise<PrepareDiagramContextResult>` — Pure handler for `prepare_diagram_context`; throws when the element path does not exist
- `handleSaveDiagram({ elementPath, diagramType, mermaidContent }): Promise<SaveDiagramResult>` — Pure handler for `save_diagram`
- `handleListDiagramTypes({ layer }): { name; description }[]` — Synchronous handler for `list_diagram_types`
- `handleListDiagrams({ elementPath }): Promise<ListedDiagram[]>` — Pure handler for `list_diagrams`; returns an empty array if the folder cannot be read

### Registered MCP Tools
- `prepare_diagram_context` — Takes `rootPath`, `elementPath`, `diagramType`. Reads element's architecture.md + code files + relationships. Returns structured context the AI agent uses to generate Mermaid syntax.
- `save_diagram` — Takes `elementPath`, `diagramType`, `mermaidContent`. Writes `[type].mermaid.md` file in the element's folder with a markdown wrapper.
- `list_diagram_types` — Takes `layer`. Returns available supplementary diagram types for that C4 layer (from project plan Section 7).
- `list_diagrams` — Takes `elementPath`. Scans for existing `.mermaid.md` files and returns their names/types.

## Constants
- `DIAGRAM_TYPES` — Record mapping each Layer to its available diagram types with names and descriptions

## Classes
- No classes — tool handler functions

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, diagrams, mermaid, generation, context]
- **Depends on**: [../../core/parser/architecture.md](../../core/parser/architecture.md), [../../core/tree/architecture.md](../../core/tree/architecture.md), [../../core/config/architecture.md](../../core/config/architecture.md), [../../core/drift/architecture.md](../../core/drift/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md)
- **Depended by**: [../docs/architecture.md](../docs/architecture.md)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- The tool assembles context but does NOT call an AI — the agent's LLM generates the Mermaid syntax
- Code files are truncated at 5KB to avoid overwhelming the agent context
- Diagram files use the `[type].mermaid.md` naming convention per project plan Section 7
- Save wraps mermaid in a markdown code block for GitHub/VS Code rendering
