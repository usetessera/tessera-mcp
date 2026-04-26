# Shared (MCP Server)

## Overview
Shared TypeScript types, interfaces, and constants used across the MCP server's tools and core components. Defines the canonical data model for architecture elements, tree structures, layer enums, and configuration types.

## Metadata
- **Layer**: Component
- **Tags**: [types, constants, shared, typescript]
- **Depends on**: None
- **Depended by**: [../tools/architecture.md](../tools/architecture.md), [../core/architecture.md](../core/architecture.md)
- **Owner**: @jonny
- **Status**: Active

## Interfaces
- TypeScript type exports consumed at compile time by tools and core
- Constant exports (PRODUCT_NAME, CONFIG_DIR, layer definitions)

## Key Decisions
- Separate shared module from extension/shared to avoid cross-package dependencies in MVP
- Will evaluate merging into a top-level shared package if significant duplication emerges
