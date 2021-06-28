import * as cors from "cors";
import * as express from "express";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";
import * as bodyParser from "body-parser";
import { createCloudEndpoints } from "./apis/gcloud";
import { StorageEmulator } from "./index";
import { createFirebaseEndpoints } from "./apis/firebase";

/**
 * @param defaultProjectId
 * @param emulator
 */
export function createApp(
  defaultProjectId: string,
  emulator: StorageEmulator
): Promise<express.Express> {
  const { storageLayer } = emulator;
  const app = express();

  EmulatorLogger.forEmulator(Emulators.STORAGE).log(
    "DEBUG",
    `Temp file directory for storage emulator: ${storageLayer.dirPath}`
  );

  // Enable CORS for all APIs, all origins (reflected), and all headers (reflected).
  // This is similar to production behavior. Safe since all APIs are cookieless.
  app.use(
    cors({
      origin: true,
      exposedHeaders: [
        "content-type",
        "x-firebase-storage-version",
        "x-goog-upload-url",
        "x-goog-upload-status",
        "x-goog-upload-command",
        "x-gupload-uploadid",
        "x-goog-upload-header-content-length",
        "x-goog-upload-header-content-type",
        "x-goog-upload-protocol",
        "x-goog-upload-status",
        "x-goog-upload-chunk-granularity",
        "x-goog-upload-control-url",
      ],
    })
  );

  app.use(bodyParser.raw({ limit: "130mb", type: "application/x-www-form-urlencoded" }));
  app.use(bodyParser.raw({ limit: "130mb", type: "multipart/related" }));

  app.use(
    express.json({
      type: ["application/json"],
    })
  );

  app.post("/internal/export", async (req, res) => {
    const path = req.body.path;
    if (!path) {
      res.status(400).send("Export request body must include 'path'.");
      return;
    }

    await storageLayer.export(path);
    res.sendStatus(200);
  });

  app.put("/internal/setRules", async (req, res) => {
    // Payload:
    // {
    //   rules: {
    //     files: [{ name:<string> content: <string> }]
    //   }
    // }
    // TODO: Add a bucket parameter for per-bucket rules support

    const rules = req.body.rules;
    if (!(rules && Array.isArray(rules.files) && rules.files.length > 0)) {
      res.status(400).send("Request body must include 'rules.files' array .");
      return;
    }

    const file = rules.files[0];
    if (!(file.name && file.content)) {
      res
        .status(400)
        .send(
          "Request body must include 'rules.files' array where each member contains 'name' and 'content'."
        );
      return;
    }

    const name = file.name;
    const content = file.content;
    const issues = await emulator.loadRuleset({ files: [{ name, content }] });

    if (issues.errors.length > 0) {
      res.status(400).json({
        message: "There was an error updating rules, see logs for more details",
      });
      return;
    }

    res.status(200).json({
      message: "Rules updated successfully",
    });
  });

  app.post("/internal/reset", (req, res) => {
    storageLayer.reset();
    res.sendStatus(200);
  });

  app.use("/v0", createFirebaseEndpoints(emulator));
  app.use("/", createCloudEndpoints(emulator));

  return Promise.resolve(app);
}
