"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventarcEmulator = void 0;
const express = __importStar(require("express"));
const constants_1 = require("./constants");
const types_1 = require("./types");
const utils_1 = require("../utils");
const emulatorLogger_1 = require("./emulatorLogger");
const registry_1 = require("./registry");
const error_1 = require("../error");
const eventarcEmulatorUtils_1 = require("./eventarcEmulatorUtils");
const cors = __importStar(require("cors"));
const GOOGLE_CHANNEL = "google";
class EventarcEmulator {
    constructor(args) {
        this.args = args;
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.EVENTARC);
        this.events = {};
    }
    createHubServer() {
        const registerTriggerRoute = `/emulator/v1/projects/:project_id/triggers/:trigger_name(*)`;
        const registerTriggerHandler = (req, res) => {
            try {
                const { projectId, triggerName, eventTrigger, key } = getTriggerIdentifiers(req);
                this.logger.logLabeled("BULLET", "eventarc", `Registering Eventarc event trigger for ${key} with trigger name ${triggerName}.`);
                const eventTriggers = this.events[key] || [];
                eventTriggers.push({ projectId, triggerName, eventTrigger });
                this.events[key] = eventTriggers;
                res.status(200).send({ res: "OK" });
            }
            catch (error) {
                res.status(400).send({ error });
            }
        };
        const getTriggerIdentifiers = (req) => {
            const projectId = req.params.project_id;
            const triggerName = req.params.trigger_name;
            if (!projectId || !triggerName) {
                const error = "Missing project ID or trigger name.";
                this.logger.log("ERROR", error);
                throw error;
            }
            const bodyString = req.rawBody.toString();
            const substituted = bodyString.replaceAll("${PROJECT_ID}", projectId);
            const body = JSON.parse(substituted);
            const eventTrigger = body.eventTrigger;
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
        const removeTriggerHandler = (req, res) => {
            try {
                const { projectId, triggerName, eventTrigger, key } = getTriggerIdentifiers(req);
                this.logger.logLabeled("BULLET", "eventarc", `Removing Eventarc event trigger for ${key} with trigger name ${triggerName}.`);
                const eventTriggers = this.events[key] || [];
                const triggerIdentifier = { projectId, triggerName, eventTrigger };
                const removeIdx = eventTriggers.findIndex((e) => JSON.stringify(triggerIdentifier) === JSON.stringify(e));
                if (removeIdx === -1) {
                    this.logger.logLabeled("ERROR", "eventarc", "Tried to remove nonexistent trigger");
                    throw new Error(`Unable to delete function trigger ${triggerName}`);
                }
                eventTriggers.splice(removeIdx, 1);
                if (eventTriggers.length === 0) {
                    delete this.events[key];
                }
                else {
                    this.events[key] = eventTriggers;
                }
                res.status(200).send({ res: "OK" });
            }
            catch (error) {
                res.status(400).send({ error });
            }
        };
        const getTriggersRoute = `/google/getTriggers`;
        const getTriggersHandler = (req, res) => {
            res.status(200).send(this.events);
        };
        const publishEventsRoute = `/projects/:project_id/locations/:location/channels/:channel::publishEvents`;
        const publishNativeEventsRoute = `/google/publishEvents`;
        const publishEventsHandler = (req, res) => {
            const isCustom = req.params.project_id && req.params.channel;
            const channel = isCustom
                ? `projects/${req.params.project_id}/locations/${req.params.location}/channels/${req.params.channel}`
                : GOOGLE_CHANNEL;
            const body = JSON.parse(req.rawBody.toString());
            for (const event of body.events) {
                if (!event.type) {
                    res.sendStatus(400);
                    return;
                }
                this.logger.log("INFO", `Received event at channel ${channel}: ${JSON.stringify(event, null, 2)}`);
                this.triggerEventFunction(channel, event);
            }
            res.sendStatus(200);
        };
        const dataMiddleware = (req, _, next) => {
            const chunks = [];
            req.on("data", (chunk) => {
                chunks.push(chunk);
            });
            req.on("end", () => {
                req.rawBody = Buffer.concat(chunks);
                next();
            });
        };
        const hub = express();
        hub.post([registerTriggerRoute], dataMiddleware, registerTriggerHandler);
        hub.post([publishEventsRoute], dataMiddleware, publishEventsHandler);
        hub.post([publishNativeEventsRoute], dataMiddleware, cors({ origin: true }), publishEventsHandler);
        hub.post([removeTriggerRoute], dataMiddleware, removeTriggerHandler);
        hub.get([getTriggersRoute], cors({ origin: true }), getTriggersHandler);
        hub.all("*", (req, res) => {
            this.logger.log("DEBUG", `Eventarc emulator received unknown request at path ${req.path}`);
            res.sendStatus(404);
        });
        return hub;
    }
    async triggerEventFunction(channel, event) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.FUNCTIONS)) {
            this.logger.log("INFO", "Functions emulator not found. This should not happen.");
            return Promise.reject();
        }
        const key = `${event.type}-${channel}`;
        const triggers = this.events[key] || [];
        const eventPayload = channel === GOOGLE_CHANNEL ? event : (0, eventarcEmulatorUtils_1.cloudEventFromProtoToJson)(event);
        return await Promise.all(triggers
            .filter((trigger) => !trigger.eventTrigger.eventFilters ||
            this.matchesAll(event, trigger.eventTrigger.eventFilters))
            .map((trigger) => this.callFunctionTrigger(trigger, eventPayload)));
    }
    callFunctionTrigger(trigger, event) {
        return registry_1.EmulatorRegistry.client(types_1.Emulators.FUNCTIONS)
            .request({
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
                throw new error_1.FirebaseError(`Received non-200 status code: ${res.status}`);
            }
        })
            .catch((err) => {
            this.logger.log("ERROR", `Failed to trigger Functions emulator for ${trigger.triggerName}: ${err}`);
        });
    }
    matchesAll(event, eventFilters) {
        return Object.entries(eventFilters).every(([key, value]) => {
            let attr = event[key] ?? event.attributes[key];
            if (typeof attr === "object" && !Array.isArray(attr)) {
                attr = attr.ceTimestamp ?? attr.ceString;
            }
            return attr === value;
        });
    }
    async start() {
        const { host, port } = this.getInfo();
        const server = this.createHubServer().listen(port, host);
        this.destroyServer = (0, utils_1.createDestroyer)(server);
        return Promise.resolve();
    }
    async connect() {
        return Promise.resolve();
    }
    async stop() {
        if (this.destroyServer) {
            await this.destroyServer();
        }
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.EVENTARC);
        return {
            name: this.getName(),
            host,
            port,
        };
    }
    getName() {
        return types_1.Emulators.EVENTARC;
    }
}
exports.EventarcEmulator = EventarcEmulator;
//# sourceMappingURL=eventarcEmulator.js.map