import * as _ from "lodash";
import * as express from "express";
import * as cors from "cors";
import { logger } from "../logger";
import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";
import { EmulatorLogger } from "./emulatorLogger";

export interface EventarcEmulatorArgs {
  port?: number;
  host?: string;
}

export class EventarcEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  private logger = EmulatorLogger.forEmulator(Emulators.EVENTARC);

  constructor(private args: EventarcEmulatorArgs) {}

  createHubServer(): express.Application {
    const hub = express();
    hub.use(express.json());

    const publishEventsRoute = `/v1/projects/:project_id/locations/:location/channels/:channel::publishEvents`;
    const publishEventsHandler: express.RequestHandler = (req, res) => {
      const channel = req.params.channel;
      const events = req.body.events;
      for (const event of events) {
        // @todo: Call background handler.
        if (!event.type) {
          res.sendStatus(400);
        }
      }
      res.sendStatus(200);
    };
    hub.post([publishEventsRoute], publishEventsHandler);
    hub.all("*", (req, res) => {
      logger.debug(`Eventarc emulator received unknown request at path ${req.path}`);
      res.sendStatus(404);
    });
    return hub;
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    const server = this.createHubServer().listen(port, host);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    // wip. what to do here?
  }

  async stop(): Promise<void> {
    if (this.destroyServer) {
      await this.destroyServer();
    }
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.EVENTARC);
    const port = this.args.port || Constants.getDefaultPort(Emulators.EVENTARC);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.EVENTARC;
  }
}
