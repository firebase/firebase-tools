import { resource } from "../resource";
import { McpContext } from "../types";
import * as path from "path";
import * as fs from "fs/promises";

export const RESOURCE_MIME_TYPE = "application/vnd.mcp.ext-app+html";
const resourceUri = "ui://core/update_environment/mcp-app.html";

export const update_environment_ui = resource(
  {
    uri: resourceUri,
    name: "Update Environment UI",
    description: "Visual interface for selecting active Firebase project",
    mimeType: RESOURCE_MIME_TYPE,
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_uri: string, _ctx: McpContext) => {
    try {
      const htmlPath = path.join(__dirname, "../apps/update_environment/mcp-app.html");
      const html = await fs.readFile(htmlPath, "utf-8");
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
          },
        ],
      };
    } catch (e: any) {
      throw new Error(`Failed to load Update Environment UI: ${e.message}`);
    }
  },
);
