import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PRODUCT_NAME } from "./shared/constants/constants.js";
import { resolveDefaultRootPath, type ServerContext } from "./core/config/config.js";
import { registerReadTools } from "./tools/read/read.js";
import { registerWriteTools } from "./tools/write/write.js";
import { registerContextTools } from "./tools/context/context.js";
import { registerValidationTools } from "./tools/validation/validation.js";
import { registerDiagramTools } from "./tools/diagram/diagram.js";
import { registerScaffoldTools } from "./tools/scaffold/scaffold.js";
import { registerDocsTools } from "./tools/docs/docs.js";
import { registerProtocolTools } from "./tools/protocols/protocols.js";
import { registerWorkflowTools } from "./tools/workflows/workflows.js";

async function main() {
  const ctx: ServerContext = {
    defaultRootPath: resolveDefaultRootPath(process.argv.slice(2), process.env, process.cwd()),
  };

  // Log to stderr so it doesn't pollute the stdio JSON-RPC stream.
  console.error(`[${PRODUCT_NAME}] default root: ${ctx.defaultRootPath}`);

  const server = new McpServer({
    name: PRODUCT_NAME,
    version: "0.1.0",
  });

  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerContextTools(server, ctx);
  registerValidationTools(server, ctx);
  registerDiagramTools(server, ctx);
  registerScaffoldTools(server, ctx);
  registerDocsTools(server, ctx);
  registerProtocolTools(server, ctx);
  registerWorkflowTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
