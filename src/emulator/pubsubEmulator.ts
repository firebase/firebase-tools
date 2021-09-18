import * as uuid from "uuid";
import { CloudEvent, HTTP } from "cloudevents";
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
  triggersByTopic: Map<string, { triggerKeys: Set<string>; triggers: Trigger[] }>;

  // Map of topic name to a PubSub subscription object
  subscriptionsByTopic: Map<string, Subscription>;

  private logger = EmulatorLogger.forEmulator(Emulators.PUBSUB);

  constructor(private args: PubsubEmulatorArgs) {
    const { host, port } = this.getInfo();
    this.pubsub = new PubSub({
      apiEndpoint: `${host}:${port}`,
      projectId: this.args.projectId,
    });

    this.triggersByTopic = new Map();
    this.subscriptionsByTopic = new Map();
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

    const topicTriggers = this.triggersByTopic.get(topicName) || {
      triggerKeys: new Set(),
      triggers: [],
    };
    if (topicTriggers.triggerKeys.has(topicName) && this.subscriptionsByTopic.has(topicName)) {
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

    topicTriggers.triggerKeys.add(triggerKey);
    topicTriggers.triggers.push({ triggerKey, signatureType });
    this.triggersByTopic.set(topicName, topicTriggers);
    this.subscriptionsByTopic.set(topicName, sub);
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
          data: message.data.toString("utf-8"),
        },
        subscription: "", // TODO: figure out subs.
      };
      const ce = HTTP.structured(
        new CloudEvent({
          type: "google.cloud.pubsub.topic.v1.messagePublished",
          source: `//pubsub.googleapis.com/projects/${this.args.projectId}/topics/${topic}`,
          data,
        })
      );
      return { ...baseOpts, data: ce.body, headers: ce.headers };
    }
    throw new FirebaseError(`Unsupported trigger signature: ${signatureType}`);
  }

  private async onMessage(topicName: string, message: Message) {
    this.logger.logLabeled("DEBUG", "pubsub", `onMessage(${topicName}, ${message.id})`);
    const topicTriggers = this.triggersByTopic.get(topicName);
    if (!topicTriggers || topicTriggers.triggerKeys.size === 0) {
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
      `Executing ${topicTriggers.triggerKeys.size} matching triggers (${JSON.stringify(
        Array.from(topicTriggers.triggerKeys)
      )})`
    );

    for (const { triggerKey, signatureType } of topicTriggers.triggers) {
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
