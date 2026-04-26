# Workflow Tools

## Overview
High-level MCP workflow tools that compose lower-level Tessera primitives into concrete agent commands. These tools review drift, plan and apply documentation updates, summarize PR architecture impact, bootstrap projects, generate diagrams, suggest improvements, and validate release readiness.

## Metadata
- **Layer**: Module
- **Tags**: [mcp-tools, workflows, diagrams, drift, release]
- **Depends on**: [../validation/architecture.md](../validation/architecture.md), [../scaffold/architecture.md](../scaffold/architecture.md), [../protocols/architecture.md](../protocols/architecture.md), [../../core/architecture.md](../../core/architecture.md)
- **Depended by**: None (MCP protocol entry point)
- **Owner**: @jonny
- **Status**: Active

## Files
- `workflows.ts` — Registers high-level workflow MCP tools and contains deterministic handlers for drift review, documentation update planning, PR summaries, bootstrap orchestration, diagram generation, and release readiness checks.

## Functions
- `handleReviewArchitectureDrift(rootPath)` — Aggregates validation outputs into a prioritized drift plan.
- `handleUpdateStaleDocumentation(args)` — Produces reviewable documentation update drafts and optional mechanical `## Files` updates.
- `handleApplyDocumentationUpdates(args)` — Applies exact reviewed `architecture.md` replacement content.
- `handlePrepareArchitecturePrSummary(rootPath)` — Summarizes architecture impact from Git status/diff.
- `handleBootstrapTesseraProject(rootPath)` — Returns architecture scaffold and protocol bootstrap preparation in one response.
- `handleSuggestArchitectureImprovements(rootPath)` — Reports modeling and metadata improvements.
- `handleGenerateArchitectureDiagram(args)` — Generates deterministic Mermaid diagram specs from architecture metadata.
- `handleGenerateSystemMap(args)` — Convenience wrapper for system-map diagrams.
- `handleValidateReleaseReadiness(args)` — Checks package/docs/build metadata for release blockers.

## Key Decisions
- Semantic documentation rewrites are planned, not silently applied.
- Mechanical file-section updates can be generated deterministically, but still default to dry run.
- Diagram generation returns Mermaid source that can be saved and rendered by existing docs tools.
