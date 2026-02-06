import * as express from "express";

import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { createDestroyer } from "../utils";
import { EmulatorLogger } from "./emulatorLogger";
import { EventTrigger } from "./functionsEmulatorShared";
import { CloudEvent } from "./events/types";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { cloudEventFromProtoToJson } from "./eventarcEmulatorUtils";
import * as cors from "cors";

interface EmulatedEventTrigger {
  projectId: string;
  triggerName: string;
  eventTrigger: EventTrigger;
}

interface RequestWithRawBody extends express.Request {
  rawBody: Buffer;
}

export interface EventarcEmulatorArgs {
  port?: number;
  host?: string;
}
const GOOGLE_CHANNEL = "google";

export class EventarcEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  private logger = EmulatorLogger.forEmulator(Emulators.EVENTARC);
  private events: { [key: string]: EmulatedEventTrigger[] } = {};

  constructor(private args: EventarcEmulatorArgs) {}

  createHubServer(): express.Application {
    const registerTriggerRoute = `/emulator/v1/projects/:project_id/triggers/:trigger_name(*)`;
    const registerTriggerHandler: express.RequestHandler = (req, res) => {
      try {
        const { projectId, triggerName, eventTrigger, key } = getTriggerIdentifiers(req);
        this.logger.logLabeled(
          "BULLET",
          "eventarc",
          `Registering Eventarc event trigger for ${key} with trigger name ${triggerName}.`,
        );
        const eventTriggers = this.events[key] || [];
        eventTriggers.push({ projectId, triggerName, eventTrigger });
        this.events[key] = eventTriggers;
        res.status(200).send({ res: "OK" });
      } catch (error) {
        res.status(400).send({ error });
      }
    };

    const getTriggerIdentifiers = (req: express.Request) => {
      const projectId = req.params.project_id;
      const triggerName = req.params.trigger_name;
      if (!projectId || !triggerName) {
        const error = "Missing project ID or trigger name.";
        this.logger.log("ERROR", error);
        throw error;
      }
      const bodyString = (req as RequestWithRawBody).rawBody.toString();
      const substituted = bodyString.replaceAll("${PROJECT_ID}", projectId);
      const body = JSON.parse(substituted);
      const eventTrigger = body.eventTrigger as EventTrigger;
      if (!eventTrigger) {
        const error = `Missing event trigger for ${triggerName}.`;
        this.logger.log("ERROR", error);
        throw error;
      }
      const channel = eventTrigger.channel || GOOGLE_CHANNEL;
      const key = `${eventTrigger.eventType}-${channel}`;
      return { projectId, triggerName, eventTrigger, key };
    };

    const removeTriggerRoute = `/emulator/v1/remove/projects/:project_id/triggers/:trigger_name(*)`;
    const removeTriggerHandler: express.RequestHandler = (req, res) => {
      try {
        const { projectId, triggerName, eventTrigger, key } = getTriggerIdentifiers(req);
        this.logger.logLabeled(
          "BULLET",
          "eventarc",
          `Removing Eventarc event trigger for ${key} with trigger name ${triggerName}.`,
        );
        const eventTriggers = this.events[key] || [];
        const triggerIdentifier = { projectId, triggerName, eventTrigger };
        const removeIdx = eventTriggers.findIndex(
          (e) => JSON.stringify(triggerIdentifier) === JSON.stringify(e),
        );
        if (removeIdx === -1) {
          this.logger.logLabeled("ERROR", "eventarc", "Tried to remove nonexistent trigger");
          throw new Error(`Unable to delete function trigger ${triggerName}`);
        }
        eventTriggers.splice(removeIdx, 1);
        if (eventTriggers.length === 0) {
          delete this.events[key];
        } else {
          this.events[key] = eventTriggers;
        }
        res.status(200).send({ res: "OK" });
      } catch (error) {
        res.status(400).send({ error });
      }
    };

    const getTriggersRoute = `/google/getTriggers`;
    const getTriggersHandler: express.RequestHandler = (req, res) => {
      res.status(200).send(this.events);
    };

    const publishEventsRoute = `/projects/:project_id/locations/:location/channels/:channel::publishEvents`;
    const publishNativeEventsRoute = `/google/publishEvents`;

    const publishEventsHandler: express.RequestHandler = (req, res) => {
      const isCustom = req.params.project_id && req.params.channel;

      const channel = isCustom
        ? `projects/${req.params.project_id}/locations/${req.params.location}/channels/${req.params.channel}`
        : GOOGLE_CHANNEL;

      const body = JSON.parse((req as RequestWithRawBody).rawBody.toString());
      for (const event of body.events) {
        if (!event.type) {
          res.sendStatus(400);
          return;
        }
        this.logger.log(
          "INFO",
          `Received event at channel ${channel}: ${JSON.stringify(event, null, 2)}`,
        );
        this.triggerEventFunction(channel, event);
      }
      res.sendStatus(200);
    };

    const dataMiddleware: express.RequestHandler = (req, _, next) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        (req as RequestWithRawBody).rawBody = Buffer.concat(chunks);
        next();
      });
    };

    const hub = express();
    hub.post([registerTriggerRoute], dataMiddleware, registerTriggerHandler);
    hub.post([publishEventsRoute], dataMiddleware, publishEventsHandler);
    hub.post(
      [publishNativeEventsRoute],
      dataMiddleware,
      cors({ origin: true }),
      publishEventsHandler,
    );
    hub.post([removeTriggerRoute], dataMiddleware, removeTriggerHandler);
    hub.get([getTriggersRoute], cors({ origin: true }), getTriggersHandler);
    hub.all("*", (req, res) => {
      this.logger.log("DEBUG", `Eventarc emulator received unknown request at path ${req.path}`);
      res.sendStatus(404);
    });
    return hub;
  }

  async triggerEventFunction(channel: string, event: CloudEvent<any>): Promise<void[]> {
    if (!EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
      this.logger.log("INFO", "Functions emulator not found. This should not happen.");
      return Promise.reject();
    }
    const key = `${event.type}-${channel}`;
    const triggers = this.events[key] || [];
    const eventPayload = channel === GOOGLE_CHANNEL ? event : cloudEventFromProtoToJson(event);
    return await Promise.all(
      triggers
        .filter(
          (trigger) =>
            !trigger.eventTrigger.eventFilters ||
            this.matchesAll(event, trigger.eventTrigger.eventFilters),
        )
        .map((trigger) => this.callFunctionTrigger(trigger, eventPayload)),
    );
  }

  callFunctionTrigger(trigger: EmulatedEventTrigger, event: CloudEvent<any>): Promise<void> {
    return EmulatorRegistry.client(Emulators.FUNCTIONS)
      .request<CloudEvent<any>, NodeJS.ReadableStream>({
        method: "POST",
        path: `/functions/projects/${trigger.projectId}/triggers/${trigger.triggerName}`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        responseType: "stream",
        resolveOnHTTPError: true,
      })
      .then((res) => {
        // Since the response type is a stream and using `resolveOnHTTPError: true`, we check status manually.
        if (res.status >= 400) {
          throw new FirebaseError(`Received non-200 status code: ${res.status}`);
        }
      })
      .catch((err) => {
        this.logger.log(
          "ERROR",
          `Failed to trigger Functions emulator for ${trigger.triggerName}: ${err}`,
        );
      });
  }

  private matchesAll(event: CloudEvent<any>, eventFilters: Record<string, string>): boolean {
    return Object.entries(eventFilters).every(([key, value]) => {
      let attr = event[key] ?? event.attributes[key];
      if (typeof attr === "object" && !Array.isArray(attr)) {
        attr = attr.ceTimestamp ?? attr.ceString;
      }
      return attr === value;
    });
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    const server = this.createHubServer().listen(port, host);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this.destroyServer) {
      await this.destroyServer();
    }
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
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
