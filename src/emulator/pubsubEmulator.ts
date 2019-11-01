import * as childProcess from "child_process";
import * as request from "request";
import { PubSub, Subscription, Message } from "@google-cloud/pubsub";

import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import * as javaEmulators from "../serve/javaEmulators";
import { Constants } from "./constants";

export interface PubsubEmulatorArgs {
  port?: number;
  host?: string;
  projectId?: string;
  auto_download?: boolean;
}

export class PubsubEmulator implements EmulatorInstance {
  pubsub: PubSub;
  triggers: Map<string, string>;
  subscriptions: Map<string, Subscription>;

  constructor(private args: PubsubEmulatorArgs) {
    // TODO: Variable port and project
    this.pubsub = new PubSub({
      apiEndpoint: "localhost:8085",
      projectId: "fir-dumpster",
    });

    this.triggers = new Map();
    this.subscriptions = new Map();
  }

  async start(): Promise<void> {
    return javaEmulators.start(Emulators.PUBSUB, this.args);
  }

  async connect(): Promise<void> {
    // TODO: Should I add message listeners here?
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
    console.log(`addTrigger(${topicName}, ${trigger})`);
    const topic = this.pubsub.topic(topicName);
    try {
      console.log(`Creating topic: ${topicName}`);
      await topic.create();
    } catch (e) {
      if (e && e.code === 6) {
        console.log(`Topic ${topicName} exists`);
      } else {
        throw e;
      }
    }

    const subName = `emulator-sub-${topicName}`;
    let sub;
    try {
      console.log(`Creating sub for topic: ${topicName}`);
      [sub] = await topic.createSubscription(subName);
    } catch (e) {
      if (e && e.code === 6) {
        console.log(`Sub for ${topicName} exists`);
        sub = topic.subscription(`emulator-sub-${topicName}`);
      } else {
        console.warn(JSON.stringify(e));
        throw e;
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
      // TODO: Throw
      console.log(`No trigger for topic: ${topicName}`);
      return;
    }

    // TODO
    const projectId = "fir-dumpster";

    const body = {
      context: {
        // TODO: Is this an acceptable eventId?
        eventId: message.id,
        resource: {
          service: "pubsub.googleapis.com",
          name: `projects/${projectId}/topics/${topicName}`,
        },
        eventType: "google.pubsub.topic.publish",
        timestamp: message.publishTime.toISOString(),
      },
      data: {
        data: message.data,
        attributes: message.attributes,
      },
    };

    // TODO: Take host and port as input
    const route = `functions/projects/${topicName}/triggers/${trigger}`;
    request.post(`http://localhost:5001/${route}`, {
      body: JSON.stringify(body),
    });

    // TODO: Wait for success before ack.
    message.ack();
  }
}
