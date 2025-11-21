export type ToolDef =
  // Asserts that the tool with this name was called successfully
  | string
  | {
      // Name of the tool
      name: string;
      // Asserts that the tool arguments contain this string
      argumentContains?: string;
      // Asserts that the tool's success equals this value
      successIs?: boolean;
    };

export interface ParsedToolLog {
  name: string;
  args: string;
  success: boolean;
  duration_ms: number;
}

export function getToolName(toolDef: ToolDef): string {
  if (typeof toolDef === "string") {
    return toolDef;
  }
  return toolDef.name;
}

export function getToolArgumentsDebug(toolDef: ToolDef): string {
  if (typeof toolDef !== "string") {
    const out = [];
    if (toolDef.successIs) {
      out.push(`success=${toolDef.successIs}`);
      // If you don't pass successIs, assert that it was successful
    } else {
      out.push(`success=true`);
    }
    if (toolDef.argumentContains) {
      out.push(`contains=${toolDef.argumentContains}`);
    }
    return out.join(",");
  }
  // If you just pass a string, assert that the tool was successful
  return "success=true";
}

export function toolArgumentsMatch(toolDef: ToolDef, log: ParsedToolLog): boolean {
  let success = true;
  if (typeof toolDef !== "string") {
    if (toolDef.argumentContains) {
      if (!log.args.includes(toolDef.argumentContains)) {
        success = false;
      }
    }
    if (toolDef.successIs !== undefined) {
      if (log.success !== toolDef.successIs) {
        success = false;
      }
      // If you don't pass successIs, assert that it was successful
    } else if (!log.success) {
      success = false;
    }
    // If you just pass a string, assert that the tool was successful
  } else {
    if (!log.success) {
      success = false;
    }
  }
  return success;
}
