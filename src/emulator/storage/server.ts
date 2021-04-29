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

  // Allow all origins and headers for CORS requests to Storage Emulator.
  // This is safe since Storage Emulator does not use cookies.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS, PATCH");
    res.set(
      "Access-Control-Expose-Headers",
      [
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
      ].join(",")
    );

    if (req.method === "OPTIONS") {
      // This is a CORS preflight request. Just handle it.
      res.end();
    } else {
      next();
    }
  });

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
    }

    await storageLayer.export(path);
    res.sendStatus(200);
  });

  app.post("/internal/reset", (req, res) => {
    storageLayer.reset();
    res.sendStatus(200);
  });

  app.use("/v0", createFirebaseEndpoints(emulator));
  app.use("/", createCloudEndpoints(emulator));

  app.all("**", (req, res) => {
    if (process.env.STORAGE_EMULATOR_DEBUG) {
      console.table(req.headers);
      console.log(req.method, req.url);
      res.json("endpoint not implemented");
    } else {
      res.sendStatus(404).json("endpoint not implemented");
    }
  });

  return Promise.resolve(app);
}
