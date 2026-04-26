# Types (MCP Server)

## Overview
Shared TypeScript interfaces and type definitions for the MCP server. Defines the core data model used across tools and core modules: architecture elements, tree structure, layer enum, metadata fields, tool input/output schemas, and configuration types.

## Functions
- No functions — this module contains only type/interface definitions

## Interfaces (`types.ts`)
- `ElementMetadata` — Parsed metadata: layer, tags, dependsOn, dependedBy, owner, status
- `ParsedArchitectureMd` — Fully parsed architecture.md: name, overview, metadata, optional layer-specific sections (externalSystems, actors, technology, apiSurface, deployment, interfaces, functions, classes, keyDecisions), raw content
- `ArchitectureElement` — Tree node: name, path, relativePath, layer, overview, metadata, children
- `ArchitectureTree` — Root wrapper: root element + rootPath
- `ConfigFile` — Parsed config.yaml: ignore patterns array
- `SearchResult` — Search hit: name, path, relativePath, layer, overview, tags, matchField
- `ElementContext` — Context summary: element, parent, siblings, children
- `DiagramFile` — Diagram metadata: name, path, type (mermaid diagram type)
- `ScaffoldProposal` — Proposed scaffold output: elements to create, suggested layers, inferred relationships

## Classes
- No classes — TypeScript interfaces only

## Metadata
- **Layer**: Module
- **Tags**: [types, interfaces, typescript, data-model]
- **Depends on**: [../constants/architecture.md](../constants/architecture.md) (imports Layer enum)
- **Depended by**: All MCP server modules
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Types mirror the extension/shared/types where applicable but are not imported from there — no cross-package dependency in MVP
- Will evaluate a shared top-level types package if duplication becomes a maintenance burden
