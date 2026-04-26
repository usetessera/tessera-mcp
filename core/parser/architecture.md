# Parser

## Overview
Architecture.md parsing module. Reads architecture.md file content and extracts structured metadata: element name, overview text, layer, tags, dependencies, owner, status, and key decisions. Parses the inline Markdown section format defined by the framework.

## Functions (`parser.ts`)
- `parseArchitectureMd(filePath: string): Promise<ParsedArchitectureMd>` — Reads an architecture.md file from disk and parses it into structured data
- `parseContent(content: string): ParsedArchitectureMd` — Parses raw architecture.md content string into structured data
- `extractSection(content: string, sectionName: string): string | null` — Extracts text content of a named ## section
- `extractMetadata(content: string): ElementMetadata` — Parses the ## Metadata section into typed fields
- `parseTags(value: string | null): string[]` — Parses `[tag1, tag2]` format into array
- `parseDependencyLinks(value: string | null): string[]` — Extracts paths from markdown links `[name](path)` or comma-separated text
- `parseFilesSection(section: string | null): FileInfo[]` — Parses the `## Files` section into FileInfo objects (name, extension, description, documented flag)

## Classes
- No classes — pure parsing functions

## Metadata
- **Layer**: Module
- **Tags**: [parser, markdown, metadata, extraction]
- **Depends on**: [../../shared/types/architecture.md](../../shared/types/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md)
- **Depended by**: [../tree/architecture.md](../tree/architecture.md), [../../tools/read/architecture.md](../../tools/read/architecture.md), [../../tools/context/architecture.md](../../tools/context/architecture.md)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Parse inline Markdown sections, not YAML frontmatter (per project plan Section 17.1)
- Parser is lenient — missing sections return null rather than throwing errors
