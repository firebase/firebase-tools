import { resource } from "../resource";
import * as path from "path";
import * as fs from "fs/promises";

import { RESOURCE_MIME_TYPE } from "../util";
const resourceUri = "ui://core/update_environment/mcp-app.html";

export const update_environment_ui = resource(
  {
    uri: resourceUri,
    name: "Update Environment UI",
    description: "Visual interface for selecting active Firebase project",
    mimeType: RESOURCE_MIME_TYPE,
  },
  async () => {
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to load Update Environment UI: ${message}`);
    }
  },
);
