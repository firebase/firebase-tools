import * as express from "express";
import * as path from "path";
import { Emulators, ListenSpec } from "./types";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { EmulatorLogger } from "./emulatorLogger";
import { Constants } from "./constants";
import { emulatorSession } from "../track";
import { ExpressBasedEmulator } from "./ExpressBasedEmulator";
import { ALL_EXPERIMENTS, ExperimentName, isEnabled } from "../experiments";
import { EmulatorHub } from "./hub";

export interface EmulatorUIOptions {
  listen: ListenSpec[];
  projectId: string;
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
    // hard to accomplish using client SDKs, consider adding an API below.
    app.get(
      "/api/config",
      this.jsonHandler(() => {
        const json = {
          projectId,
          experiments: [],
          ...(hub! as EmulatorHub).getRunningEmulatorsMapping(),
        };

        // Googlers: see go/firebase-emulator-ui-usage-collection-design?pli=1#heading=h.jwz7lj6r67z8
        // for more detail
        if (emulatorGaSession) {
          json.analytics = emulatorGaSession;
        }

        // pick up any experiments enabled with `firebase experiment:enable`
        if (enabledExperiments) {
          json.experiments = enabledExperiments;
        }

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
