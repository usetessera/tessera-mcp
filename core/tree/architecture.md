# Tree

## Overview
Filesystem traversal and element tree building module. Recursively scans the project directory, applies ignore patterns, reads architecture.md files, infers C4 layers based on folder depth and contents, and assembles the complete ArchitectureTree data structure used by all tools.

## Functions (`tree.ts`)
- `buildArchitectureTree(rootPath: string, config: ConfigFile): Promise<ArchitectureTree>` — Entry point: recursively scans filesystem, respects ignore patterns, infers layers, returns full element hierarchy
- `getElementByPath(tree: ArchitectureTree, relativePath: string): ArchitectureElement | null` — Finds an element by its relative path in the tree
- `flattenTree(tree: ArchitectureTree): ArchitectureElement[]` — Returns all elements as a flat array for searching
- `hasArchitectureMd(dirPath: string): Promise<boolean>` — Checks whether a directory contains an architecture.md file
- `collectPromotedChildren(dirPath, rootPath, depth, config): Promise<ArchitectureElement[]>` — Collects children from pass-through folders (no architecture.md), recursing through nested pass-through folders until architectural elements are found
- `mergeFileInfo(entries: Dirent[], documentedFiles: FileInfo[]): FileInfo[]` — Merges actual files on disk with documented files from ## Files section. Undocumented files get empty description

## Functions (`ignore.ts`)
- `matchesIgnorePattern(name: string, patterns: string[]): boolean` — Tests a filename against ignore patterns (exact match + simple glob with `*`)

## Classes
- No classes — pure functions with the tree as a data structure

## Metadata
- **Layer**: Module
- **Tags**: [tree, traversal, filesystem, layer-inference, ignore-patterns]
- **Depends on**: [../parser/architecture.md](../parser/architecture.md), [../../shared/types/architecture.md](../../shared/types/architecture.md), [../../shared/constants/architecture.md](../../shared/constants/architecture.md)
- **Depended by**: [../../tools/read/architecture.md](../../tools/read/architecture.md), [../../tools/context/architecture.md](../../tools/context/architecture.md)
- **Owner**: @jonny
- **Status**: Active

## Key Decisions
- Layer inference is depth + leaf detection, not explicit configuration
- Config is loaded once per tree build, not cached across requests in MVP
- Ignore patterns use minimatch-style glob matching
- Pass-through folders: directories without architecture.md are transparent — their children are promoted to the parent level and inherit the parent's architectural depth, avoiding phantom elements from conventional code folders like `src/`, `lib/`, `app/`
- Every element (Module, Docs, Container, Component, Context, Landscape) collects its direct files from disk, merged with `## Files` documentation from its architecture.md. Files not in docs are marked undocumented — they surface on the canvas as scattered files and in `validate_files` as drift (ADR-012, ADR-016).
- File collection is per-folder only; files inside child element folders are not included here — they belong to the child.
