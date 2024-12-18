/**
 * Webhook send API used to notify VSCode of states within
 */

import { logger } from "../logger.js";
import * as apiv2 from "../apiv2.js";

export enum VSCODE_MESSAGE {
  EMULATORS_STARTED = "EMULATORS_STARTED",
  EMULATORS_START_ERRORED = "EMULATORS_START_ERRORED",
  EMULATORS_SHUTDOWN = "EMULATORS_SHUTDOWN",
}

export interface WebhookBody {
  message: VSCODE_MESSAGE;
  content?: string;
}

export const DEFAULT_PORT = "40001"; // 5 digit default used by vscode;

// If port in use, VSCode will pass a different port to the integrated term through env var
export const port = process.env.VSCODE_WEBHOOK_PORT || DEFAULT_PORT;
export async function sendVSCodeMessage(body: WebhookBody) {
  const jsonBody = JSON.stringify(body);

  try {
    const client = new apiv2.Client({
      auth: false,
      urlPrefix: `http://localhost:${port}`,
    });
    return client.request({
      method: "POST",
      path: "vscode/notify",
      body: jsonBody,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-mantle-admin": "all",
      },
      timeout: 3000,
    });
  } catch (e) {
    logger.debug(
      `Could not find VSCode notification endpoint: ${e}. If you are not running the Firebase Data Connect VSCode extension, this is expected and not an issue.`,
    );
  }
}
