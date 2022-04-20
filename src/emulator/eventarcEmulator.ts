import * as _ from "lodash";
import * as express from "express";
import * as api from "../api";
import { logger } from "../logger";
import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";
import { EmulatorLogger } from "./emulatorLogger";
import { EventTrigger } from "./functionsEmulatorShared";
import { CloudEvent } from "./events/types";
import { EmulatorRegistry } from "./registry";

interface CustomEventTrigger {
  projectId: string;
  triggerName: string;
  eventTrigger: EventTrigger;
}

export interface EventarcEmulatorArgs {
  port?: number;
  host?: string;
}

export class EventarcEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  private logger = EmulatorLogger.forEmulator(Emulators.EVENTARC);
  private customEvents: { [key: string]: CustomEventTrigger[] } = {};

  constructor(private args: EventarcEmulatorArgs) {}

  createHubServer(): express.Application {

    const registerTriggerRoute = `/emulator/v1/projects/:project_id/triggers/:trigger_name`;
    const registerTriggerHandler: express.RequestHandler = (req, res) => {
      const projectId = req.params.project_id;
      const triggerName = req.params.trigger_name;
      logger.info(`Registering custom event trigger for ${triggerName}.`);
      const eventTrigger = req.body.eventTrigger as EventTrigger;
      if (!eventTrigger) {
        logger.debug(`Missing event trigger for ${triggerName}.`);
        res.status(400);
        return;
      }
      const key = `${eventTrigger.eventType}-${eventTrigger.channel}`;
      const customEventTriggers = this.customEvents[key] || [];
      customEventTriggers.push({ projectId, triggerName, eventTrigger });
      this.customEvents[key] = customEventTriggers;
    };

    const publishEventsRoute = `/v1/projects/:project_id/locations/:location/channels/:channel::publishEvents`;
    const publishEventsHandler: express.RequestHandler = (req, res) => {
      const channel = req.params.channel;
      const events = req.body.events;
      for (const event of events) {
        if (!event.type) {
          res.sendStatus(400);
          return;
        }
        this.triggerCustomEventFunction(channel, event);
      }
      res.sendStatus(200);
    };

    const hub = express();
    hub.use(express.json());
    hub.post([registerTriggerRoute], registerTriggerHandler);
    hub.post([publishEventsRoute], publishEventsHandler);
    hub.all("*", (req, res) => {
      logger.debug(`Eventarc emulator received unknown request at path ${req.path}`);
      res.sendStatus(404);
    });
    return hub;
  }

  async triggerCustomEventFunction(channel: string, event: CloudEvent<any>) {
    const functionsEmulator = EmulatorRegistry.get(Emulators.FUNCTIONS);
    if (!functionsEmulator) {
      logger.debug("Functions emulator not found. This should not happen.");
      return Promise.reject();
    }
    const key = `${event.type}-${channel}`;
    const triggers = this.customEvents[key] || [];
    return await Promise.all(
      triggers
        .filter(
          (trigger) =>
            !trigger.eventTrigger.eventFilters ||
            Object.entries(trigger.eventTrigger.eventFilters).every(([k, v]) => event[k] === v)
        )
        .map((trigger) =>
          api
            .request(
              "POST",
              `/functions/projects/${trigger.projectId}/triggers/${trigger.triggerName}`,
              {
                origin: `http://${EmulatorRegistry.getInfoHostString(functionsEmulator.getInfo())}`,
              }
            )
            .then(() => true)
            .catch((err) => {
              logger.debug(`Failed to trigger Functions emulator for ${trigger.triggerName}.`);
              throw err;
            })
        )
    );
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
