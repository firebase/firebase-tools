import * as vscode from "vscode";
import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import { VSCODE_MESSAGE, WebhookBody } from "../../../src/dataconnect/webhook";
import { pluginLogger } from "../logger-wrapper";
export function registerWebhooks() {
  const app = express();
  app.use(bodyParser.json()); // for parsing application/json

  const server = createServer(app);
  const port = 40000; // TODO: generate port dynamically with this as default

  server.listen(port, () => {
    pluginLogger.debug(`VSCode notification server listening on port ${port}`);
  });

  app.post("/webhook", (req, res) => {
    const webhookData: WebhookBody = req.body;
    if (webhookData.message === VSCODE_MESSAGE.EMULATORS_STARTED) {
      vscode.commands.executeCommand("firebase.emulators.findRunning");
    }

    // Send a response back to the webhook sender if needed
    res.sendStatus(200);
  });

  return {
    dispose: () => {
      server.close();
    },
  };
}
