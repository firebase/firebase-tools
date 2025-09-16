"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PubsubEmulator = void 0;
const uuid = require("uuid");
const pubsub_1 = require("@google-cloud/pubsub");
const downloadableEmulators = require("./downloadableEmulators");
const emulatorLogger_1 = require("./emulatorLogger");
const types_1 = require("../emulator/types");
const constants_1 = require("./constants");
const error_1 = require("../error");
const registry_1 = require("./registry");
const child_process_1 = require("child_process");
// Finds processes with "pubsub-emulator" in the description and runs `kill` if any exist
// Since the pubsub emulator doesn't export any data, force-killing will not affect export-on-exit
// Note the `[p]` is a workaround to avoid selecting the currently running `ps` process.
const PUBSUB_KILL_COMMAND = "pubsub_pids=$(ps aux | grep '[p]ubsub-emulator' | awk '{print $2}');" +
    " if [ ! -z '$pubsub_pids' ]; then kill -9 $pubsub_pids; fi;";
class PubsubEmulator {
    get pubsub() {
        if (!this._pubsub) {
            this._pubsub = new pubsub_1.PubSub({
                apiEndpoint: registry_1.EmulatorRegistry.url(types_1.Emulators.PUBSUB).host,
                projectId: this.args.projectId,
            });
        }
        return this._pubsub;
    }
    constructor(args) {
        this.args = args;
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.PUBSUB);
        this.triggersForTopic = new Map();
        this.subscriptionForTopic = new Map();
    }
    async start() {
        return downloadableEmulators.start(types_1.Emulators.PUBSUB, this.args);
    }
    connect() {
        return Promise.resolve();
    }
    async stop() {
        try {
            await downloadableEmulators.stop(types_1.Emulators.PUBSUB);
        }
        catch (e) {
            this.logger.logLabeled("DEBUG", "pubsub", JSON.stringify(e));
            if (process.platform !== "win32") {
                const buffer = (0, child_process_1.execSync)(PUBSUB_KILL_COMMAND);
                this.logger.logLabeled("DEBUG", "pubsub", "Pubsub kill output: " + JSON.stringify(buffer));
            }
        }
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.PUBSUB);
        return {
            name: this.getName(),
            host,
            port,
            pid: downloadableEmulators.getPID(types_1.Emulators.PUBSUB),
        };
    }
    getName() {
        return types_1.Emulators.PUBSUB;
    }
    async maybeCreateTopicAndSub(topicName) {
        const topic = this.pubsub.topic(topicName);
        try {
            this.logger.logLabeled("DEBUG", "pubsub", `Creating topic: ${topicName}`);
            await topic.create();
        }
        catch (e) {
            // CODE 6: ALREADY EXISTS. Carry on.
            if (e && e.code === 6) {
                this.logger.logLabeled("DEBUG", "pubsub", `Topic ${topicName} exists`);
            }
            else {
                throw new error_1.FirebaseError(`Could not create topic ${topicName}`, { original: e });
            }
        }
        const subName = `emulator-sub-${topicName}`;
        let sub;
        try {
            this.logger.logLabeled("DEBUG", "pubsub", `Creating sub for topic: ${topicName}`);
            [sub] = await topic.createSubscription(subName);
        }
        catch (e) {
            if (e && e.code === 6) {
                // CODE 6: ALREADY EXISTS. Carry on.
                this.logger.logLabeled("DEBUG", "pubsub", `Sub for ${topicName} exists`);
                sub = topic.subscription(subName);
            }
            else {
                throw new error_1.FirebaseError(`Could not create sub ${subName}`, { original: e });
            }
        }
        sub.on("message", (message) => {
            this.onMessage(topicName, message);
        });
        return sub;
    }
    async addTrigger(topicName, triggerKey, signatureType) {
        this.logger.logLabeled("DEBUG", "pubsub", `addTrigger(${topicName}, ${triggerKey}, ${signatureType})`);
        const sub = await this.maybeCreateTopicAndSub(topicName);
        const triggers = this.triggersForTopic.get(topicName) || [];
        if (triggers.some((t) => t.triggerKey === triggerKey) &&
            this.subscriptionForTopic.has(topicName)) {
            this.logger.logLabeled("DEBUG", "pubsub", "Trigger already exists");
            return;
        }
        triggers.push({ triggerKey, signatureType });
        this.triggersForTopic.set(topicName, triggers);
        this.subscriptionForTopic.set(topicName, sub);
    }
    ensureFunctionsClient() {
        if (this.client !== undefined)
            return;
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.FUNCTIONS)) {
            throw new error_1.FirebaseError(`Attempted to execute pubsub trigger but could not find the Functions emulator`);
        }
        this.client = registry_1.EmulatorRegistry.client(types_1.Emulators.FUNCTIONS);
    }
    createLegacyEventRequestBody(topic, message) {
        return {
            context: {
                eventId: uuid.v4(),
                resource: {
                    service: "pubsub.googleapis.com",
                    name: `projects/${this.args.projectId}/topics/${topic}`,
                },
                eventType: "google.pubsub.topic.publish",
                timestamp: message.publishTime.toISOString(),
            },
            data: {
                data: message.data,
                attributes: message.attributes,
            },
        };
    }
    createCloudEventRequestBody(topic, message) {
        // Pubsub events from Pubsub Emulator include a date with nanoseconds.
        // Prod Pubsub doesn't publish timestamp at that level of precision. Timestamp with nanosecond precision also
        // are difficult to parse in languages other than Node.js (e.g. python).
        const truncatedPublishTime = new Date(message.publishTime.getTime()).toISOString();
        const data = {
            message: {
                messageId: message.id,
                publishTime: truncatedPublishTime,
                attributes: message.attributes,
                orderingKey: message.orderingKey,
                data: message.data.toString("base64"),
                // NOTE: We include camel_cased attributes since they also available and depended on by other runtimes
                // like python.
                message_id: message.id,
                publish_time: truncatedPublishTime,
            },
            subscription: this.subscriptionForTopic.get(topic).name,
        };
        return {
            specversion: "1.0",
            id: uuid.v4(),
            time: truncatedPublishTime,
            type: "google.cloud.pubsub.topic.v1.messagePublished",
            source: `//pubsub.googleapis.com/projects/${this.args.projectId}/topics/${topic}`,
            data,
        };
    }
    async onMessage(topicName, message) {
        this.logger.logLabeled("DEBUG", "pubsub", `onMessage(${topicName}, ${message.id})`);
        const triggers = this.triggersForTopic.get(topicName);
        if (!triggers || triggers.length === 0) {
            throw new error_1.FirebaseError(`No trigger for topic: ${topicName}`);
        }
        this.logger.logLabeled("DEBUG", "pubsub", `Executing ${triggers.length} matching triggers (${JSON.stringify(triggers.map((t) => t.triggerKey))})`);
        this.ensureFunctionsClient();
        for (const { triggerKey, signatureType } of triggers) {
            try {
                const path = `/functions/projects/${this.args.projectId}/triggers/${triggerKey}`;
                if (signatureType === "event") {
                    await this.client.post(path, this.createLegacyEventRequestBody(topicName, message));
                }
                else if (signatureType === "cloudevent") {
                    await this.client.post(path, this.createCloudEventRequestBody(topicName, message), { headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" } });
                }
                else {
                    throw new error_1.FirebaseError(`Unsupported trigger signature: ${signatureType}`);
                }
            }
            catch (e) {
                this.logger.logLabeled("DEBUG", "pubsub", e);
            }
        }
        this.logger.logLabeled("DEBUG", "pubsub", `Acking message ${message.id}`);
        message.ack();
    }
}
exports.PubsubEmulator = PubsubEmulator;
