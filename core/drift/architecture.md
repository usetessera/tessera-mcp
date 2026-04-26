# drift

## Overview
Computes the scoped drift-tax footer appended to MCP tool responses. Implements wall 2 of the drift-enforcement bundle defined in ADR-015: every MCP response names only the drift in elements the agent just touched (git-dirty + explicitly targeted), not the whole tree.

## Files
- `drift.ts` — Scope resolution, drift collection, footer formatting; exports `computeDriftFooter`, `withDriftFooter`, `jsonResultWithDrift`
- `drift.test.ts` — Tests covering clean trees, explicit-path scope, git-dirty scope, suppress flag, and broken-link detection

## Functions
- `computeDriftFooter(args): Promise<string | null>` — Runs validators, filters to scope, returns formatted footer or null
- `withDriftFooter(result, args): Promise<ToolResult>` — Appends footer to an existing MCP tool result
- `jsonResultWithDrift(data, args): Promise<ToolResult>` — Convenience: JSON-serialises data and appends footer in one call

## Metadata
- **Layer**: Module
- **Tags**: [drift, validation, mcp]
- **Depends on**: [../tree/architecture.md](../tree/architecture.md), [../config/architecture.md](../config/architecture.md), [../../tools/validation/architecture.md](../../tools/validation/architecture.md)
- **Depended by**: [../../tools/read/architecture.md](../../tools/read/architecture.md), [../../tools/write/architecture.md](../../tools/write/architecture.md), [../../tools/context/architecture.md](../../tools/context/architecture.md), [../../tools/diagram/architecture.md](../../tools/diagram/architecture.md), [../../tools/docs/architecture.md](../../tools/docs/architecture.md), [../../tools/scaffold/architecture.md](../../tools/scaffold/architecture.md)
- **Owner**: @jonathanvaldes2001
- **Status**: Active

## Key Decisions
- Scope rule is `(explicit elementPath) ∪ (elements containing git-dirty files)`. Git status is the cheapest honest proxy for "what the agent just touched" — no MCP-side session state, resets on commit.
- Validators are reused from `tools/validation` rather than reimplemented. Results are filtered to the scope set, not recomputed.
- Validation tools (`validate_files`, `check_links`, etc.) do not attach this footer — they already return drift as their primary output; duplicating it would be noise.
- Footer surfaces four drift categories: undocumented files, files missing from disk, broken dependency links, and (ADR-016) non-Module files missing a pinning rationale.
- See ADR-015 for the wider enforcement architecture and ADR-016 for the non-Module file support.
