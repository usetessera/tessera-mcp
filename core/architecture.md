# Core

## Overview
Core logic for the MCP server: filesystem traversal, architecture.md parsing, element tree construction, layer inference, template generation, and configuration loading. This component contains the domain logic that tools depend on — it reads the filesystem, builds the in-memory architecture tree, and provides the data model that tools query and modify.

Contains four child modules: `tree/` (filesystem traversal), `parser/` (architecture.md parsing), `templates/` (template generation), and `config/` (config.yaml loading).

## Metadata
- **Layer**: Component
- **Tags**: [parser, tree, filesystem, templates, config, domain-logic]
- **Depends on**: [../shared/architecture.md](../shared/architecture.md)
- **Depended by**: [../tools/architecture.md](../tools/architecture.md)
- **Owner**: @jonny
- **Status**: Active

## Interfaces
- `buildArchitectureTree(rootPath: string, config: ConfigFile): Promise<ArchitectureTree>` — scans filesystem and returns the full element hierarchy
- `parseArchitectureMd(filePath: string): Promise<ParsedArchitectureMd>` — reads and parses an architecture.md file
- `generateTemplate(layer: Layer, name: string): string` — produces a templated architecture.md for a given layer
- `loadConfig(rootPath: string): Promise<ConfigFile>` — reads .tessera/config.yaml with defaults fallback

## Key Decisions
- Tree is rebuilt from filesystem on each request (no persistent cache in MVP)
- Layer detection is filesystem-based: folders with subfolders = L1-L3, leaf folders = L4
- Ignore patterns from .tessera/config.yaml are applied during traversal
