/**
 * Webhook send API used to notify VSCode of states within
 */

import fetch from "node-fetch";
import { logger } from "../logger";
import { AbortSignal } from "node-fetch/externals";

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
    return await fetch(`http://localhost:${port}/vscode/notify`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-mantle-admin": "all",
      },
      body: jsonBody,
      signal: AbortSignal.timeout(3000) as unknown as AbortSignal, // necessary due to https://github.com/node-fetch/node-fetch/issues/1652
    });
  } catch (e) {
    logger.debug(
      `Could not find VSCode notification endpoint: ${e}. If you are not running the Firebase Data Connect VSCode extension, this is expected and not an issue.`,
    );
  }
}
