import * as vscode from "vscode";
import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import { VSCODE_MESSAGE, WebhookBody } from "../../../src/dataconnect/webhook";
import { ExtensionBrokerImpl } from "../extension-broker";
export function registerWebhooks() {
  const app = express();
  app.use(bodyParser.json()); // for parsing application/json

  const server = createServer(app);
  const port = 40000; // Choose an appropriate port

  server.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
  });

  app.post("/webhook", (req, res) => {
    const webhookData: WebhookBody = req.body;
    console.log("webhook");
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
