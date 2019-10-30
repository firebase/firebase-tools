import { PubSub, Subscription } from "@google-cloud/pubsub";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import * as childProcess from "child_process";

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
    // TODO: Variable port
    this.pubsub = new PubSub({
      apiEndpoint: "localhost:8085",
    });
    // TODO
    this.topics = ["test-topic"];
    this.subscriptions = new Map();
  }

  async start(): Promise<void> {
    this.instance = childProcess.spawn("gcloud", ["beta", "emulators", "pubsub", "start"], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    // TODO: Start the emulator
    // TODO: Should we wait to construct the client before then/
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    console.log(`Pubsub client emulated: ${this.pubsub.isEmulator}`)

    for (const topicName of this.topics) {
      const topic = this.pubsub.topic(topicName);
      const topicExists = await topic.exists();
      if (!topicExists) {
        console.log(`Creating topic: ${topicName}`);
        await topic.create();
      } else {
        console.log(`Topic ${topicName} exists`);
      }

      const sub = this.pubsub.subscription(`emulator-sub-${topicName}`);
      const subExists = await sub.exists();
      if (!subExists) {
        console.log(`Creating sub for topic: ${topicName}`);
        await sub.create();
      } else {
        console.log(`Sub for ${topicName} already exists`);
      }

      this.subscriptions.set(topicName, sub);
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
}
