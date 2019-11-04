import * as request from "request";
import { PubSub, Subscription, Message } from "@google-cloud/pubsub";

import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import * as javaEmulators from "../serve/javaEmulators";
import { Constants } from "./constants";
import { FirebaseError } from "../error";

export interface PubsubEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  auto_download?: boolean;
}

export class PubsubEmulator implements EmulatorInstance {
  pubsub: PubSub;
  triggers: Map<string, string>;
  subscriptions: Map<string, Subscription>;

  constructor(private args: PubsubEmulatorArgs) {
    const { host, port } = this.getInfo();
    this.pubsub = new PubSub({
      apiEndpoint: `${host}:${port}`,
      projectId: this.args.projectId,
    });

    this.triggers = new Map();
    this.subscriptions = new Map();
  }

  async start(): Promise<void> {
    return javaEmulators.start(Emulators.PUBSUB, this.args);
  }

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return javaEmulators.stop(Emulators.PUBSUB);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.PUBSUB);
    const port = this.args.port || Constants.getDefaultPort(Emulators.PUBSUB);

    return {
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.PUBSUB;
  }

  async addTrigger(topicName: string, trigger: string) {
    EmulatorLogger.logLabeled("DEBUG", "pubsub", `addTrigger(${topicName}, ${trigger})`);
    const topic = this.pubsub.topic(topicName);
    try {
      EmulatorLogger.logLabeled("DEBUG", "pubsub", `Creating topic: ${topicName}`);
      await topic.create();
    } catch (e) {
      if (e && e.code === 6) {
        EmulatorLogger.logLabeled("DEBUG", "pubsub", `Topic ${topicName} exists`);
      } else {
        throw new FirebaseError(`Could not create topic ${topicName}`, { original: e });
      }
    }

    const subName = `emulator-sub-${topicName}`;
    let sub;
    try {
      EmulatorLogger.logLabeled("DEBUG", "pubsub", `Creating sub for topic: ${topicName}`);
      [sub] = await topic.createSubscription(subName);
    } catch (e) {
      if (e && e.code === 6) {
        EmulatorLogger.logLabeled("DEBUG", "pubsub", `Sub for ${topicName} exists`);
        sub = topic.subscription(`emulator-sub-${topicName}`);
      } else {
        throw new FirebaseError(`Could not create sub ${subName}`, { original: e });
      }
    }

    sub.on("message", (message: Message) => {
      this.onMessage(topicName, message);
    });

    this.triggers.set(topicName, trigger);
    this.subscriptions.set(topicName, sub);
  }

  private onMessage(topicName: string, message: Message) {
    const trigger = this.triggers.get(topicName);
    if (!trigger) {
      throw new FirebaseError(`No trigger for topic: ${topicName}`);
    }

    const body = {
      context: {
        // TODO(samstern): Is this an acceptable eventId?
        eventId: message.id,
        resource: {
          service: "pubsub.googleapis.com",
          name: `projects/${this.args.projectId}/topics/${topicName}`,
        },
        eventType: "google.pubsub.topic.publish",
        timestamp: message.publishTime.toISOString(),
      },
      data: {
        data: message.data,
        attributes: message.attributes,
      },
    };

    // TODO(samstern): Take functions host and port as input
    const route = `functions/projects/${topicName}/triggers/${trigger}`;
    request.post(
      `http://localhost:5001/${route}`,
      {
        body: JSON.stringify(body),
      },
      () => {
        message.ack();
      }
    );
  }
}
