import * as request from "request";
import * as uuid from "uuid";
import { PubSub, Subscription, Message } from "@google-cloud/pubsub";

import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorLogger } from "./emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import { FirebaseError } from "../error";
import { EmulatorRegistry } from "./registry";
import { response } from "express";

export interface PubsubEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  auto_download?: boolean;
}

export class PubsubEmulator implements EmulatorInstance {
  pubsub: PubSub;

  // Map of topic name to a list of functions to trigger
  triggers: Map<string, Set<string>>;

  // Map of topic name to a PubSub subscription object
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
    return;
  }

  async stop(): Promise<void> {
    await javaEmulators.stop(Emulators.PUBSUB);
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

    const topicTriggers = this.triggers.get(topicName) || new Set();
    if (topicTriggers.has(topicName) && this.subscriptions.has(topicName)) {
      EmulatorLogger.logLabeled("DEBUG", "pubsub", "Trigger already exists");
      return;
    }

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

    topicTriggers.add(trigger);
    this.triggers.set(topicName, topicTriggers);
    this.subscriptions.set(topicName, sub);
  }

  private onMessage(topicName: string, message: Message) {
    EmulatorLogger.logLabeled("DEBUG", "pubsub", `onMessage(${topicName}, ${message.id})`);
    const topicTriggers = this.triggers.get(topicName);
    if (!topicTriggers || topicTriggers.size === 0) {
      throw new FirebaseError(`No trigger for topic: ${topicName}`);
    }

    const functionsPort = EmulatorRegistry.getPort(Emulators.FUNCTIONS);
    if (!functionsPort) {
      throw new FirebaseError(
        `Attempted to execute pubsub trigger for topic ${topicName} but could not find Functions emulator`
      );
    }

    EmulatorLogger.logLabeled(
      "DEBUG",
      "pubsub",
      `Executing ${topicTriggers.size} matching triggers (${JSON.stringify(
        Array.from(topicTriggers)
      )})`
    );

    // We need to do one POST request for each matching trigger and only
    // 'ack' the message when they are all complete.
    let remaining = topicTriggers.size;
    for (const trigger of topicTriggers) {
      const body = {
        context: {
          eventId: uuid.v4(),
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

      const functionsUrl = `http://localhost:${functionsPort}/functions/projects/${
        this.args.projectId
      }/triggers/${trigger}`;

      request.post(
        functionsUrl,
        {
          body: body,
          json: true,
        },
        (err: any, res: request.Response) => {
          if (err) {
            EmulatorLogger.logLabeled(
              "DEBUG",
              "pubsub",
              `Error running functions: ${JSON.stringify(err)}`
            );
          }

          if (res) {
            EmulatorLogger.logLabeled(
              "DEBUG",
              "pubsub",
              `Functions emulator response: HTTP ${res.statusCode} ${JSON.stringify(res.body)}`
            );
          }

          // If this is the last trigger we need to run, ack the message.
          remaining--;
          if (remaining <= 0) {
            EmulatorLogger.logLabeled("DEBUG", "pubsub", `Acking message ${message.id}`);
            message.ack();
          }
        }
      );
    }
  }
}
