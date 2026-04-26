# Tools

## Overview
MCP tool implementations organized by category. 32 tools across 9 categories, each exposed via the MCP protocol for AI agent invocation. Categories: read tools (querying the architecture), write tools (creating/updating elements), context tools (injecting rules and scoped context into the agent), validation tools (checking documentation freshness, consistency, and structural rules), diagram tools (preparing and managing architecture diagrams), docs tools (compiling diagrams into a centralized output folder), scaffold tools (bootstrapping architecture for existing codebases), protocol tools (bootstrapping Tessera Protocols records), and workflow tools (orchestrating common agent tasks).

## Metadata
- **Layer**: Component
- **Tags**: [mcp-tools, read, write, context, validation, diagram, docs, scaffold, protocols, workflows, api]
- **Depends on**: [../core/architecture.md](../core/architecture.md), [../shared/architecture.md](../shared/architecture.md)
- **Depended by**: None (entry point for MCP protocol)
- **Owner**: @jonny
- **Status**: Active

## Interfaces
- MCP tool definitions registered with the MCP SDK server instance
- Each tool exposes: name, description, input schema (JSON Schema), and handler function

## Key Decisions
- Tools organized by category (read/, write/, context/, validation/, diagram/, docs/, scaffold/, protocols/, workflows/) rather than a flat list
- Each tool module exports a registration function that binds to the MCP server
- Phase 1 tools (7): get_architecture_tree, get_element, search_elements, update_element, create_element, get_rules, get_element_context
- Phase 2 tools (9): validate_staleness, find_orphans, check_links, prepare_diagram_context, save_diagram, list_diagram_types, list_diagrams, scaffold_existing_codebase, apply_scaffold
- Phase 3 tools (4): get_element_for_file, find_mixed_layers (ADR-011), compile_docs, check_diagram_staleness
- v1.0 tools (1): validate_files (ADR-012 file-level drift detection)
- Protocol bootstrap tools (2): prepare_protocol_bootstrap, apply_protocol_bootstrap (ADR-017)
- Workflow tools (9): review_architecture_drift, update_stale_documentation, apply_documentation_updates, prepare_architecture_pr_summary, bootstrap_tessera_project, suggest_architecture_improvements, generate_architecture_diagram, generate_system_map, validate_release_readiness (ADR-018)
