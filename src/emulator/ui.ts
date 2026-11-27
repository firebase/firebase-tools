import * as express from "express";
import * as path from "path";
import { Emulators, ListenSpec } from "./types";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { EmulatorLogger } from "./emulatorLogger";
import { Constants } from "./constants";
import { AnalyticsSession, emulatorSession } from "../track";
import { ExpressBasedEmulator } from "./ExpressBasedEmulator";
import { ALL_EXPERIMENTS, ExperimentName, isEnabled } from "../experiments";
import { EmulatorHub, GetEmulatorsResponse } from "./hub";
import { mapObject } from "../functional";
import { maybeUsePortForwarding } from "./env";

export interface EmulatorUIOptions {
  listen: ListenSpec[];
  projectId: string;
}

// Response shape for /api/config endpoint. Contains info about which emulators are running and where.
interface EmulatorConfigInfo extends GetEmulatorsResponse {
  projectId: string;
  experiments: string[];
  analytics?: AnalyticsSession;
}

export class EmulatorUI extends ExpressBasedEmulator {
  constructor(private args: EmulatorUIOptions) {
    super({
      listen: args.listen,
    });
  }

  override async start(): Promise<void> {
    await super.start();
  }

  protected override async createExpressApp(): Promise<express.Express> {
    if (!EmulatorRegistry.isRunning(Emulators.HUB)) {
      throw new FirebaseError(
        `Cannot start ${Constants.description(Emulators.UI)} without ${Constants.description(
          Emulators.HUB,
        )}!`,
      );
    }
    const hub = EmulatorRegistry.get(Emulators.HUB);
    const app = await super.createExpressApp();
    const { projectId } = this.args;
    const enabledExperiments: Array<ExperimentName> = (
      Object.keys(ALL_EXPERIMENTS) as Array<ExperimentName>
    ).filter((experimentName) => isEnabled(experimentName));
    const emulatorGaSession = emulatorSession();

    await downloadableEmulators.downloadIfNecessary(Emulators.UI);
    const downloadDetails = downloadableEmulators.getDownloadDetails(Emulators.UI);
    const webDir = path.join(downloadDetails.unzipDir!, "client");

    // Exposes the host and port of various emulators to facilitate accessing
    // them using client SDKs. For features that involve multiple emulators or
    // hard to accomplish using client SDKs, consider adding an API below
    app.get(
      "/api/config",
      this.jsonHandler(() => {
        const emulatorInfos = mapObject(
          (hub! as EmulatorHub).getRunningEmulatorsMapping(),
          maybeUsePortForwarding,
        );
        const json: EmulatorConfigInfo = {
          projectId,
          experiments: enabledExperiments ?? [],
          analytics: emulatorGaSession,
          ...emulatorInfos,
        };
        return Promise.resolve(json);
      }),
    );

    app.use(express.static(webDir));
    // Required for the router to work properly.
    app.get("*", (_, res) => {
      res.sendFile(path.join(webDir, "index.html"));
    });

    return app;
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  getName(): Emulators {
    return Emulators.UI;
  }

  jsonHandler(handler: (req: express.Request) => Promise<object>): express.Handler {
    return (req, res) => {
      handler(req).then(
        (body) => {
          res.status(200).json(body);
        },
        (err) => {
          EmulatorLogger.forEmulator(Emulators.UI).log("ERROR", err);
          res.status(500).json({
            message: err.message,
            stack: err.stack,
            raw: err,
          });
        },
      );
    };
  }
}
