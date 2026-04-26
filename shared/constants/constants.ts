// Re-export all constants from the shared package
export {
  PRODUCT_NAME,
  CONFIG_DIR,
  ARCHITECTURE_FILENAME,
  AGENT_RULES_FILE,
  CONFIG_FILE,
  Layer,
  DEPTH_TO_LAYER,
  DEPTH_TO_LAYER_LANDSCAPE,
  DEFAULT_WORKSPACE_MODE,
  depthToLayerMap,
  LAYER_DESCRIPTIONS,
  DEFAULT_IGNORE_PATTERNS,
  TOOL_NAMES,
  DIAGRAM_TYPES_BY_LAYER,
} from "@tessera/shared/constants";
export type { WorkspaceMode } from "@tessera/shared/constants";
