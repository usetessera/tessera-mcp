# Constants (MCP Server)

## Overview
Centralized constants for the MCP server. Houses PRODUCT_NAME, CONFIG_DIR, layer definitions, default ignore patterns, and MCP tool metadata (names and descriptions). Single source of truth for naming so a product name change touches one file.

## Functions
- No functions — this module exports only constants and enums

## Exports (`constants.ts`)
- `PRODUCT_NAME` — `"Tessera"`
- `CONFIG_DIR` — `".tessera"`
- `ARCHITECTURE_FILENAME` — `"architecture.md"`
- `AGENT_RULES_FILE` — `"agent-rules.md"`
- `CONFIG_FILE` — `"config.yaml"`
- `Layer` — Enum: Context, Container, Component, Module
- `DEPTH_TO_LAYER` — Maps tree depth (0–2) to Layer; depth 3+ defaults to Module
- `LAYER_DESCRIPTIONS` — Human-readable description per layer
- `DEFAULT_IGNORE_PATTERNS` — Default ignore patterns array
- `TOOL_NAMES` — String constants for all MCP tool names

## Classes
- No classes — plain constant and enum exports

## Metadata
- **Layer**: Module
- **Tags**: [constants, naming, configuration, product-name, mcp-tools]
- **Depends on**: None
- **Depended by**: All MCP server modules
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Constants duplicated from extension/shared/constants rather than cross-referencing — keeps packages independent
- TOOL_NAMES constants prevent string typos in MCP tool registration
