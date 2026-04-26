# Config

## Overview
Configuration loading module. Reads and parses the `.tessera/config.yaml` file, provides typed configuration data to the rest of the MCP server, and resolves the server-wide default project root from argv / env / cwd at startup. Falls back to sensible defaults when the config file is missing or malformed.

## Files
- `config.ts` — Config loading + ServerContext resolver
- `config.test.ts` — Tests for `resolveDefaultRootPath`

## Functions (`config.ts`)
- `loadConfig(rootPath: string): Promise<ConfigFile>` — Reads `.tessera/config.yaml` using js-yaml, returns parsed ConfigFile. Returns defaults if file doesn't exist or is invalid.
- `getWorkspaceMode(config: ConfigFile): WorkspaceMode` — Returns configured workspace mode, defaulting to `context`.
- `getIgnorePatterns(config: ConfigFile): string[]` — Returns the ignore patterns array from config, falling back to DEFAULT_IGNORE_PATTERNS if empty.
- `resolveDefaultRootPath(argv, env, cwd): string` — Resolves the server's default project root. Precedence: `--root <path>` / `--root=<path>` argv > `TESSERA_ROOT` env var > `cwd`. Lets tool callers omit `rootPath` per call.

## Types
- `ServerContext` — Carries server-wide runtime state (currently `defaultRootPath`) into each tool registrar so handlers can fill in an omitted `rootPath`.

## Classes
- No classes — pure functions

## Metadata
- **Layer**: Module
- **Tags**: [config, yaml, configuration, ignore-patterns]
- **Depends on**: [../../shared/constants/architecture.md](../../shared/constants/architecture.md), [../../shared/types/architecture.md](../../shared/types/architecture.md)
- **Depended by**: [../../tools/read/architecture.md](../../tools/read/architecture.md), [../../tools/write/architecture.md](../../tools/write/architecture.md), [../../tools/context/architecture.md](../../tools/context/architecture.md)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Uses js-yaml for YAML parsing — lightweight and widely used
- Graceful fallback to defaults on any config error (missing file, malformed YAML, missing fields)
