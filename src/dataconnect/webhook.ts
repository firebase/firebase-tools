/**
 * Webhook send API used to notify VSCode of states within
 */

import fetch from "node-fetch";
import { logger } from "../logger";

export enum VSCODE_MESSAGE {
  EMULATORS_STARTED = "EMULATORS_STARTED",
  EMULATORS_START_ERRORED = "EMULATORS_START_ERRORED",
  EMULATORS_SHUTDOWN = "EMULATORS_SHUTDOWN",
}

export interface WebhookBody {
  message: VSCODE_MESSAGE;
  content?: string;
}

export const DEFAULT_PORT = "40000"; // 6 digit default used by vscode;

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
    });
  } catch (e) {
    logger.debug(`Could not find VSCode notification endpoint: ${e}`);
  }
}
