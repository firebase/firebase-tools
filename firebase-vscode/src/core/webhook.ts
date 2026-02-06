import * as vscode from "vscode";
import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import { VSCODE_MESSAGE, WebhookBody } from "../../../src/dataconnect/webhook";
import { pluginLogger } from "../logger-wrapper";
import { findOpenPort } from "../utils/port_utils";
import { setTerminalEnvVars } from "../data-connect/terminal";

const DEFAULT_PORT = 40001;
export async function registerWebhooks() {
  const app = express();
  app.use(bodyParser.json()); // for parsing application/json

  const server = createServer(app);
  const port = await findOpenPort(DEFAULT_PORT);

  if (port !== DEFAULT_PORT) {
    setTerminalEnvVars({"VSCODE_WEBHOOK_PORT": port.toString()});
  }
  
  server.listen(port, () => {
    pluginLogger.debug(`VSCode notification server listening on port ${port}`);
  });

  app.post("/vscode/notify", (req, res) => {
    const webhookData: WebhookBody = req.body;
    // Notify extension through vscode commands
    switch (webhookData.message) {
      case VSCODE_MESSAGE.EMULATORS_STARTED: {
        pluginLogger.debug(
          "Received emulators started notification. Running detection.",
        );
        vscode.commands.executeCommand("firebase.emulators.findRunning");
        break;
      }
      case VSCODE_MESSAGE.EMULATORS_SHUTDOWN: {
        pluginLogger.debug("Received emulators shutdown notification.");
        vscode.commands.executeCommand("firebase.emulators.stopped");
        break;
      }
      default: {
        pluginLogger.debug("Received CLI notification.");
      }
    }

    // Send a response back to the webhook sender if needed
    res.sendStatus(200);
  });

  return vscode.Disposable.from({
    dispose: () => {
      server.close();
    },
  });
}
