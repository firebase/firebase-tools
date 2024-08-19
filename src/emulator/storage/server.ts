import * as cors from "cors";
import * as express from "express";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";
import * as bodyParser from "body-parser";
import { createCloudEndpoints } from "./apis/gcloud";
import { RulesConfig, StorageEmulator } from "./index";
import { createFirebaseEndpoints } from "./apis/firebase";
import { InvalidArgumentError } from "../auth/errors";
import { SourceFile } from "./rules/types";

/**
 * @param defaultProjectId
 * @param emulator
 */
export function createApp(
  defaultProjectId: string,
  emulator: StorageEmulator,
): Promise<express.Express> {
  const { storageLayer } = emulator;
  const app = express();

  EmulatorLogger.forEmulator(Emulators.STORAGE).log(
    "DEBUG",
    `Temp file directory for storage emulator: ${storageLayer.dirPath}`,
  );

  // Return access-control-allow-private-network header if requested
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
    }),
  );

  app.use(bodyParser.raw({ limit: "130mb", type: "application/x-www-form-urlencoded" }));
  app.use(bodyParser.raw({ limit: "130mb", type: "multipart/related" }));

  app.use(
    express.json({
      type: ["application/json"],
    }),
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

  /**
   * Internal endpoint to overwrite current rules. Callers provide either a single set of rules to
   * be applied to all resources or an array of rules/resource objects.
   *
   * Example payload for single set of rules:
   *
   * ```
   * {
   *    rules: {
   *      files: [{ name: <string>, content: <string> }]
   *    }
   * }
   * ```
   *
   * Example payload for multiple rules/resource objects:
   *
   * ```
   * {
   *    rules: {
   *      files: [
   *        { name: <string>, content: <string>, resource: <string> },
   *        ...
   *      ]
   *    }
   * }
   * ```
   */
  app.put("/internal/setRules", async (req, res) => {
    const rulesRaw = req.body.rules;
    if (!(rulesRaw && Array.isArray(rulesRaw.files) && rulesRaw.files.length > 0)) {
      res.status(400).json({
        message: "Request body must include 'rules.files' array",
      });
      return;
    }

    const { files } = rulesRaw;

    function parseRulesFromFiles(files: Array<unknown>): SourceFile | RulesConfig[] {
      if (files.length === 1) {
        const file = files[0];
        if (!isRulesFile(file)) {
          throw new InvalidArgumentError(
            "Each member of 'rules.files' array must contain 'name' and 'content'",
          );
        }
        return { name: file.name, content: file.content };
      }

      const rules: RulesConfig[] = [];
      for (const file of files) {
        if (!isRulesFile(file) || !file.resource) {
          throw new InvalidArgumentError(
            "Each member of 'rules.files' array must contain 'name', 'content', and 'resource'",
          );
        }
        rules.push({ resource: file.resource, rules: { name: file.name, content: file.content } });
      }
      return rules;
    }

    let rules: SourceFile | RulesConfig[];
    try {
      rules = parseRulesFromFiles(files);
    } catch (err) {
      if (err instanceof InvalidArgumentError) {
        res.status(400).json({ message: err.message });
        return;
      }
      throw err;
    }

    const issues = await emulator.replaceRules(rules);
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
    emulator.reset();
    res.sendStatus(200);
  });

  app.use("/v0", createFirebaseEndpoints(emulator));
  app.use("/", createCloudEndpoints(emulator));

  return Promise.resolve(app);
}

interface RulesFile {
  name: string;
  content: string;
  resource?: string;
}

function isRulesFile(file: unknown): file is RulesFile {
  return (
    typeof (file as RulesFile).name === "string" && typeof (file as RulesFile).content === "string"
  );
}
