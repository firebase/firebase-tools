import * as uuid from "uuid";
import { MessagePublishedData } from "@google/events/cloud/pubsub/v1/MessagePublishedData";
import { Message, PubSub, Subscription } from "@google-cloud/pubsub";

import * as api from "../api";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import { FirebaseError } from "../error";
import { EmulatorRegistry } from "./registry";
import { SignatureType } from "./functionsEmulatorShared";

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
  pubsub: PubSub;

  // Map of topic name to a list of functions to trigger
  triggersForTopic: Map<string, Trigger[]>;

  // Map of topic name to a PubSub subscription object
  subscriptionForTopic: Map<string, Subscription>;

  private logger = EmulatorLogger.forEmulator(Emulators.PUBSUB);

  constructor(private args: PubsubEmulatorArgs) {
    const { host, port } = this.getInfo();
    this.pubsub = new PubSub({
      apiEndpoint: `${host}:${port}`,
      projectId: this.args.projectId,
    });

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
    await downloadableEmulators.stop(Emulators.PUBSUB);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.PUBSUB);
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

  async addTrigger(topicName: string, triggerKey: string, signatureType: SignatureType) {
    this.logger.logLabeled(
      "DEBUG",
      "pubsub",
      `addTrigger(${topicName}, ${triggerKey}, ${signatureType})`
    );

    const triggers = this.triggersForTopic.get(topicName) || [];
    if (
      triggers.some((t) => t.triggerKey === triggerKey) &&
      this.subscriptionForTopic.has(topicName)
    ) {
      this.logger.logLabeled("DEBUG", "pubsub", "Trigger already exists");
      return;
    }

    const topic = this.pubsub.topic(topicName);
    try {
      this.logger.logLabeled("DEBUG", "pubsub", `Creating topic: ${topicName}`);
      await topic.create();
    } catch (e) {
      if (e && e.code === 6) {
        this.logger.logLabeled("DEBUG", "pubsub", `Topic ${topicName} exists`);
      } else {
        throw new FirebaseError(`Could not create topic ${topicName}`, { original: e });
      }
    }

    const subName = `emulator-sub-${topicName}`;
    let sub;
    try {
      this.logger.logLabeled("DEBUG", "pubsub", `Creating sub for topic: ${topicName}`);
      [sub] = await topic.createSubscription(subName);
    } catch (e) {
      if (e && e.code === 6) {
        this.logger.logLabeled("DEBUG", "pubsub", `Sub for ${topicName} exists`);
        sub = topic.subscription(`emulator-sub-${topicName}`);
      } else {
        throw new FirebaseError(`Could not create sub ${subName}`, { original: e });
      }
    }

    sub.on("message", (message: Message) => {
      this.onMessage(topicName, message);
    });

    triggers.push({ triggerKey, signatureType });
    this.triggersForTopic.set(topicName, triggers);
    this.subscriptionForTopic.set(topicName, sub);
  }

  private getRequestOptions(
    topic: string,
    message: Message,
    signatureType: SignatureType
  ): Record<string, unknown> {
    const baseOpts = {
      origin: `http://${EmulatorRegistry.getInfoHostString(
        EmulatorRegistry.get(Emulators.FUNCTIONS)!.getInfo()
      )}`,
    };
    if (signatureType === "event") {
      return {
        ...baseOpts,
        data: {
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
        },
      };
    } else if (signatureType === "cloudevent") {
      const data: MessagePublishedData = {
        message: {
          messageId: message.id,
          publishTime: message.publishTime,
          attributes: message.attributes,
          orderingKey: message.orderingKey,
          data: message.data.toString("base64"),
        },
        subscription: this.subscriptionForTopic.get(topic)!.name,
      };
      const ce = {
        specVersion: 1,
        type: "google.cloud.pubsub.topic.v1.messagePublished",
        source: `//pubsub.googleapis.com/projects/${this.args.projectId}/topics/${topic}`,
        data,
      };
      return {
        ...baseOpts,
        headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" },
        data: ce,
      };
    }
    throw new FirebaseError(`Unsupported trigger signature: ${signatureType}`);
  }

  private async onMessage(topicName: string, message: Message) {
    this.logger.logLabeled("DEBUG", "pubsub", `onMessage(${topicName}, ${message.id})`);
    const triggers = this.triggersForTopic.get(topicName);
    if (!triggers || triggers.length === 0) {
      throw new FirebaseError(`No trigger for topic: ${topicName}`);
    }

    if (!EmulatorRegistry.get(Emulators.FUNCTIONS)) {
      throw new FirebaseError(
        `Attempted to execute pubsub trigger for topic ${topicName} but could not find Functions emulator`
      );
    }

    this.logger.logLabeled(
      "DEBUG",
      "pubsub",
      `Executing ${triggers.length} matching triggers (${JSON.stringify(
        triggers.map((t) => t.triggerKey)
      )})`
    );

    for (const { triggerKey, signatureType } of triggers) {
      const reqOpts = this.getRequestOptions(topicName, message, signatureType);
      try {
        await api.request(
          "POST",
          `/functions/projects/${this.args.projectId}/triggers/${triggerKey}`,
          reqOpts
        );
      } catch (e) {
        this.logger.logLabeled("DEBUG", "pubsub", e);
      }
    }
    this.logger.logLabeled("DEBUG", "pubsub", `Acking message ${message.id}`);
    message.ack();
  }
}
