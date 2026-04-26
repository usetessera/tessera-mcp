# Templates

## Overview
Architecture.md template generation module. Produces correctly formatted architecture.md content for each C4 layer when new elements are created. Templates follow the exact format defined in the CLAUDE.md framework conventions (Section 15 of the project plan).

## Functions (`templates.ts`)
- `generateTemplate(layer: Layer, name: string): string` — Returns a populated architecture.md template for the given layer and element name. Dispatches to layer-specific template functions.

Internal (non-exported) functions:
- `contextTemplate(name: string): string` — L1 Context template with External Systems and Actors sections
- `containerTemplate(name: string): string` — L2 Container template with Technology, API Surface, and Deployment sections
- `componentTemplate(name: string): string` — L3 Component template with Interfaces section
- `moduleTemplate(name: string): string` — L4 Module template with Files, Functions, and Classes sections

## Classes
- No classes — pure template functions returning strings

## Metadata
- **Layer**: Module
- **Tags**: [templates, generation, architecture-md, scaffolding]
- **Depends on**: [../../shared/constants/architecture.md](../../shared/constants/architecture.md) (imports Layer enum)
- **Depended by**: [../../tools/write/architecture.md](../../tools/write/architecture.md)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Templates are plain string interpolation, not a template engine — simplicity over flexibility
- Templates match the exact format in CLAUDE.md so generated files are immediately framework-compliant
