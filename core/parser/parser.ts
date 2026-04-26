import { readFile } from "node:fs/promises";
import type { ParsedArchitectureMd } from "../../shared/types/types.js";

// Re-export all parser functions from the shared package
export {
  parseContent,
  extractTitle,
  extractSection,
  extractMetadata,
  extractField,
  parseTags,
  parseDependencyLinks,
  parseFilesSection,
} from "@tessera/shared/parser";

// Re-import parseContent for use in parseArchitectureMd
import { parseContent } from "@tessera/shared/parser";

/**
 * Reads and parses an architecture.md file into structured data.
 * This is the only MCP-server-specific function — it adds the filesystem read
 * on top of the shared parseContent.
 */
export async function parseArchitectureMd(
  filePath: string,
): Promise<ParsedArchitectureMd> {
  const content = await readFile(filePath, "utf-8");
  return parseContent(content);
}
