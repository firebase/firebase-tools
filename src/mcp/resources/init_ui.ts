import { resource } from "../resource";
import { McpContext } from "../types";
import * as path from "path";
import * as fs from "fs/promises";

export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
const resourceUri = "ui://core/init/mcp-app.html";

export const init_ui = resource(
  {
    uri: resourceUri,
    name: "Init UI",
    description: "Visual interface for Firebase Init",
    mimeType: RESOURCE_MIME_TYPE,
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_uri: string, _ctx: McpContext) => {
    try {
      // The built HTML will be in lib/mcp/apps/init/mcp-app.html
      const htmlPath = path.join(__dirname, "../apps/init/mcp-app.html");
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
      throw new Error(`Failed to load Init UI: ${e.message}`);
    }
  },
);
