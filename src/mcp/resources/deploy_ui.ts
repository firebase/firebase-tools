import { resource } from "../resource";
import * as path from "path";
import * as fs from "fs/promises";

export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
const resourceUri = "ui://core/deploy/mcp-app.html";

export const deploy_ui = resource(
  {
    uri: resourceUri,
    name: "Deploy UI",
    description: "Visual interface for Firebase Deploy",
    mimeType: RESOURCE_MIME_TYPE,
  },
  async () => {
    try {
      const htmlPath = path.join(__dirname, "../apps/deploy/mcp-app.html");
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
      throw new Error(`Failed to load Deploy UI: ${e.message}`);
    }
  },
);
