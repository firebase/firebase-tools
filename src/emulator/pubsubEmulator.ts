import * as childProcess from "child_process";
import * as request from "request";
import { PubSub, Subscription, Message } from "@google-cloud/pubsub";

import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";

export interface PubsubEmulatorArgs {
  port?: number;
  host?: string;
  projectId?: string;
}

export class PubsubEmulator implements EmulatorInstance {
  pubsub: PubSub;
  topics: Array<string>;
  subscriptions: Map<string, Subscription>;
  instance?: childProcess.ChildProcess;

  constructor(private args: PubsubEmulatorArgs) {
    // TODO: Variable port and project
    this.pubsub = new PubSub({
      apiEndpoint: "localhost:8085",
      projectId: "fir-dumpster",
    });

    // TODO: Get this from functions
    this.topics = ["test-topic"];
    this.subscriptions = new Map();
  }

  async start(): Promise<void> {
    // /Library/Java/JavaVirtualMachines/default/Contents/Home/bin/java
    //    -jar /Users/samstern/google-cloud-sdk/platform/pubsub-emulator/lib/cloud-pubsub-emulator-0.1-SNAPSHOT-all.jar
    //    --host=localhost --port=8085

    // TODO: Maybe combine this logic with some of the JavaEmulators stuff?
    // TODO: Do a simpler check for presence of "gcloud" and "pubsub emulator"
    this.instance = childProcess.spawn(
      "gcloud",
      ["--quiet", "beta", "emulators", "pubsub", "start"],
      {
        stdio: ["inherit", "pipe", "pipe"],
      }
    );

    // TODO: Use Firebase errors
    if (!this.instance) {
      throw new Error("Pubsub instance null");
    }

    this.instance.on("error", (err: any) => {
      console.warn("error", err);
    });
    this.instance.on("exit", (code, signal) => {
      console.warn("exit", code, signal);
    });

    // TODO: Start the emulator
    // TODO: Should we wait to construct the client before then/
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    console.log(`Pubsub client emulated: ${this.pubsub.isEmulator}`);

    for (const topicName of this.topics) {
      await this.subscribeTo(topicName);
    }

    return Promise.resolve();
  }

  async stop(): Promise<void> {
    // TODO
    if (this.instance) {
      this.instance.kill();
    }
    return Promise.resolve();
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

  private async subscribeTo(topicName: string) {
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

    this.subscriptions.set(topicName, sub);
  }

  private onMessage(topicName: string, message: Message) {
    const data = message.data.toString();
    const dataObj = JSON.parse(data);
    console.log(`onMessage(${topicName}): ${JSON.stringify(dataObj)}`);

    const body = {
      data: {
        data: message.data,
        attributes: message.attributes,
      },
    };

    // TODO: Take functions stuff as input
    // TODO: how do I know the name?
    console.log("POSTING...");
    const route = "functions/projects/fir-dumpster/triggers/pubsubFn";
    request.post(`http://localhost:5001/${route}`, {
      body: JSON.stringify(body),
    });

    message.ack();
  }
}
