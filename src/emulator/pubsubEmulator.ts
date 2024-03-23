import * as uuid from "uuid";
import { MessagePublishedData } from "@google/events/cloud/pubsub/v1/MessagePublishedData";
import { Message, PubSub, Subscription } from "@google-cloud/pubsub";

import * as downloadableEmulators from "./downloadableEmulators";
import { Client } from "../apiv2";
import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import { FirebaseError } from "../error";
import { EmulatorRegistry } from "./registry";
import { SignatureType } from "./functionsEmulatorShared";
import { CloudEvent } from "./events/types";
import { execSync } from "child_process";

// Finds processes with "pubsub-emulator" in the description and runs `kill` if any exist
// Since the pubsub emulator doesn't export any data, force-killing will not affect export-on-exit
// Note the `[p]` is a workaround to avoid selecting the currently running `ps` process.
const PUBSUB_KILL_COMMAND =
  "pubsub_pids=$(ps aux | grep '[p]ubsub-emulator' | awk '{print $2}');" +
  " if [ ! -z '$pubsub_pids' ]; then kill -9 $pubsub_pids; fi;";

export interface PubsubEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  auto_download?: boolean;
}

interface Trigger {
  triggerKey: string;
  signatureType: SignatureType;
}

export class PubsubEmulator implements EmulatorInstance {
  private _pubsub: PubSub | undefined;

  // Map of topic name to a list of functions to trigger
  triggersForTopic: Map<string, Trigger[]>;

  // Map of topic name to a PubSub subscription object
  subscriptionForTopic: Map<string, Subscription>;

  // Client for communicating with the Functions Emulator
  private client?: Client;

  private logger = EmulatorLogger.forEmulator(Emulators.PUBSUB);

  get pubsub(): PubSub {
    if (!this._pubsub) {
      this._pubsub = new PubSub({
        apiEndpoint: EmulatorRegistry.url(Emulators.PUBSUB).host,
        projectId: this.args.projectId,
      });
    }
    return this._pubsub;
  }

  constructor(private args: PubsubEmulatorArgs) {
    this.triggersForTopic = new Map();
    this.subscriptionForTopic = new Map();
  }

  async start(): Promise<void> {
    return downloadableEmulators.start(Emulators.PUBSUB, this.args);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    try {
      await downloadableEmulators.stop(Emulators.PUBSUB);
    } catch (e: unknown) {
      this.logger.logLabeled("DEBUG", "pubsub", JSON.stringify(e));
      if (process.platform !== "win32") {
        const buffer = execSync(PUBSUB_KILL_COMMAND);
        this.logger.logLabeled("DEBUG", "pubsub", "Pubsub kill output: " + JSON.stringify(buffer));
      }
    }
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.PUBSUB);

    return {
      name: this.getName(),
      host,
      port,
      pid: downloadableEmulators.getPID(Emulators.PUBSUB),
    };
  }

  getName(): Emulators {
    return Emulators.PUBSUB;
  }

  private async maybeCreateTopicAndSub(topicName: string): Promise<Subscription> {
    const topic = this.pubsub.topic(topicName);
    try {
      this.logger.logLabeled("DEBUG", "pubsub", `Creating topic: ${topicName}`);
      await topic.create();
    } catch (e: any) {
      // CODE 6: ALREADY EXISTS. Carry on.
      if (e && e.code === 6) {
        this.logger.logLabeled("DEBUG", "pubsub", `Topic ${topicName} exists`);
      } else {
        throw new FirebaseError(`Could not create topic ${topicName}`, { original: e });
      }
    }

    const subName = `emulator-sub-${topicName}`;
    let sub: Subscription;
    try {
      this.logger.logLabeled("DEBUG", "pubsub", `Creating sub for topic: ${topicName}`);
      [sub] = await topic.createSubscription(subName);
    } catch (e: any) {
      if (e && e.code === 6) {
        // CODE 6: ALREADY EXISTS. Carry on.
        this.logger.logLabeled("DEBUG", "pubsub", `Sub for ${topicName} exists`);
        sub = topic.subscription(subName);
      } else {
        throw new FirebaseError(`Could not create sub ${subName}`, { original: e });
      }
    }

    sub.on("message", (message: Message) => {
      this.onMessage(topicName, message);
    });

    return sub;
  }

  async addTrigger(topicName: string, triggerKey: string, signatureType: SignatureType) {
    this.logger.logLabeled(
      "DEBUG",
      "pubsub",
      `addTrigger(${topicName}, ${triggerKey}, ${signatureType})`,
    );

    const sub = await this.maybeCreateTopicAndSub(topicName);

    const triggers = this.triggersForTopic.get(topicName) || [];
    if (
      triggers.some((t) => t.triggerKey === triggerKey) &&
      this.subscriptionForTopic.has(topicName)
    ) {
      this.logger.logLabeled("DEBUG", "pubsub", "Trigger already exists");
      return;
    }

    triggers.push({ triggerKey, signatureType });
    this.triggersForTopic.set(topicName, triggers);
    this.subscriptionForTopic.set(topicName, sub);
  }

  private ensureFunctionsClient() {
    if (this.client !== undefined) return;

    if (!EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
      throw new FirebaseError(
        `Attempted to execute pubsub trigger but could not find the Functions emulator`,
      );
    }
    this.client = EmulatorRegistry.client(Emulators.FUNCTIONS);
  }

  private createLegacyEventRequestBody(topic: string, message: Message) {
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

  private createCloudEventRequestBody(
    topic: string,
    message: Message,
  ): CloudEvent<MessagePublishedData> {
    // Pubsub events from Pubsub Emulator include a date with nanoseconds.
    // Prod Pubsub doesn't publish timestamp at that level of precision. Timestamp with nanosecond precision also
    // are difficult to parse in languages other than Node.js (e.g. python).
    const truncatedPublishTime = new Date(message.publishTime.getMilliseconds()).toISOString();
    const data: MessagePublishedData = {
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
      } as MessagePublishedData["message"],
      subscription: this.subscriptionForTopic.get(topic)!.name,
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

  private async onMessage(topicName: string, message: Message) {
    this.logger.logLabeled("DEBUG", "pubsub", `onMessage(${topicName}, ${message.id})`);
    const triggers = this.triggersForTopic.get(topicName);
    if (!triggers || triggers.length === 0) {
      throw new FirebaseError(`No trigger for topic: ${topicName}`);
    }

    this.logger.logLabeled(
      "DEBUG",
      "pubsub",
      `Executing ${triggers.length} matching triggers (${JSON.stringify(
        triggers.map((t) => t.triggerKey),
      )})`,
    );

    this.ensureFunctionsClient();

    for (const { triggerKey, signatureType } of triggers) {
      try {
        const path = `/functions/projects/${this.args.projectId}/triggers/${triggerKey}`;
        if (signatureType === "event") {
          await this.client!.post(path, this.createLegacyEventRequestBody(topicName, message));
        } else if (signatureType === "cloudevent") {
          await this.client!.post<CloudEvent<MessagePublishedData>, unknown>(
            path,
            this.createCloudEventRequestBody(topicName, message),
            { headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" } },
          );
        } else {
          throw new FirebaseError(`Unsupported trigger signature: ${signatureType}`);
        }
      } catch (e: any) {
        this.logger.logLabeled("DEBUG", "pubsub", e);
      }
    }
    this.logger.logLabeled("DEBUG", "pubsub", `Acking message ${message.id}`);
    message.ack();
  }
}
