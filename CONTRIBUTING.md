# Contributing to @tessera/mcp

Thanks for considering a contribution. This guide covers how to run the server locally, how to add or modify a tool, and how to test changes.

## Project layout

```
mcp-server/
├── index.ts              Entry point — registers tool categories
├── core/                 Tree building, parsing, config, templates
├── tools/                Tool handlers grouped by category
│   ├── read/
│   ├── write/
│   ├── context/
│   ├── validation/
│   ├── diagram/
│   ├── docs/
│   └── scaffold/
├── shared/               Types and constants (also the source of `PRODUCT_NAME`)
└── tests/                vitest test suites
```

## Local development

```bash
npm install
npm run build      # esbuild → dist/index.js
npm test           # vitest
npm run lint       # tsc --noEmit
```

To exercise the built server end-to-end, point a local Claude Code or Cursor config at the absolute path of `dist/index.js`:

```json
{
  "mcpServers": {
    "tessera-dev": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

## Inspecting the tool surface

The MCP Inspector is the fastest way to verify tool registrations, schemas, and responses without involving an agent:

```bash
npx @modelcontextprotocol/inspector node ./dist/index.js
```

This opens a UI at `http://localhost:6274` where you can list all MCP tools, view their schemas, invoke any tool with custom parameters, and inspect responses. Run this before opening a PR that touches tool definitions.

## Testing

Tests use [vitest](https://vitest.dev). The testing strategy has three layers:

### Layer 1 — Functional tests (CI-enforced)

- **Unit tests** cover internal logic (`parser`, `tree`, `config`, `templates`).
- **Integration tests** exercise tool handlers against fixture repositories under `tests/fixtures/`. Each fixture represents a known state (clean project, staleness drift, orphan folders, broken links, file drift, mixed layers, pass-through folders) and the tests assert that each tool produces the expected output for that state.

When adding a tool, also add an integration test against an existing fixture or create a new fixture if needed. Tool handlers are exported as standalone async functions so they can be tested without booting an MCP transport.

### Layer 2 — Agent-facing quality (manual, periodic)

The "user" of this server is an LLM, not a human. After non-trivial tool-description changes, sanity-check that an agent picks the right tool for the right task. The dog-fooding loop (using Tessera while developing Tessera) is the primary signal here.

### Layer 3 — Performance instrumentation (always-on)

Heavy tool handlers log to `stderr` when they exceed a latency threshold (500 ms for read tools, 2000 ms for validation/scaffold). If you add a new tool that walks the tree or shells out to git, add similar instrumentation.

The full strategy and rationale live in the project's monorepo as ADR-013.

## Adding a tool

1. Pick the right category folder under `tools/`. If none fits, prefer adding to the closest existing category over creating a new one.
2. Export a standalone handler function (`handleMyTool(args): Promise<Result>`). Keep all logic in this function — the registration call is a thin wrapper.
3. Register it in the category's `register…Tools(server)` function with a clear `description` and parameter `describe()` annotations. Treat these strings as the API docs for the LLM.
4. Add an integration test in `tests/`.
5. Update `README.md` (tool list and category count) and `CHANGELOG.md` (Unreleased section).

## Submitting a PR

- Branch from `main`.
- Run `npm run lint && npm test && npm run build` before pushing.
- Reference the relevant issue (or open one first if the change is non-trivial).
- Keep PRs focused — one feature or fix per PR.

## Releasing (maintainers only)

Releases are tagged on `main` (`vX.Y.Z`); the GitHub Actions `publish` workflow builds, tests, and publishes to npm using the `NPM_TOKEN` repository secret. Before tagging:

1. Bump `version` in `package.json`.
2. Move the `Unreleased` section of `CHANGELOG.md` to a dated version entry.
3. Commit, tag (`git tag vX.Y.Z`), push (`git push --tags`).
