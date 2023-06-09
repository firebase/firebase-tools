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

  // Retrun access-control-allow-private-network header if requested
  // Enables accessing locahost when site is exposed via tunnel see https://github.com/firebase/firebase-tools/issues/4227
  // Aligns with https://wicg.github.io/private-network-access/#headers
  // Replace with cors option if adopted, see https://github.com/expressjs/cors/issues/236
  app.use("/", (req, res, next) => {
    if (req.headers["access-control-request-private-network"]) {
      res.setHeader("access-control-allow-private-network", "true");
    }
    next();
  });

  // Enable CORS for all APIs, all origins (reflected), and all headers (reflected).
  // This is similar to production behavior. Safe since all APIs are cookieless.
  app.use(
    cors({
      origin: true,
      exposedHeaders: [
        "content-type",
        "x-firebase-storage-version",
        "X-Goog-Upload-Size-Received",
        "x-goog-upload-url",
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
    const initiatedBy: string = req.body.initiatedBy || "unknown";
    const path: string = req.body.path;
    if (!path) {
      res.status(400).send("Export request body must include 'path'.");
      return;
    }

    await storageLayer.export(path, { initiatedBy });
    res.sendStatus(200);
  });

  app.post("/internal/reset", (req, res) => {
    emulator.reset();
    res.sendStatus(200);
  });

  app.use("/v0", createFirebaseEndpoints(emulator));
  app.use("/", createCloudEndpoints(emulator));

  return Promise.resolve(app);
}
