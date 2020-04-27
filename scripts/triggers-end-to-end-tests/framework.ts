import * as request from "request";

import { CLIProcess } from "./cli";

const FIREBASE_PROJECT_ZONE = "us-central1";

/*
 * Markers this test looks for in the emulator process stdout
 * as one test for whether a cloud function was triggered.
 */
const RTDB_FUNCTION_LOG = "========== RTDB FUNCTION ==========";
const FIRESTORE_FUNCTION_LOG = "========== FIRESTORE FUNCTION ==========";
const PUBSUB_FUNCTION_LOG = "========== PUBSUB FUNCTION ==========";
const ALL_EMULATORS_STARTED_LOG = "All emulators started, it is now safe to connect.";

interface ConnectionInfo {
  host: string;
  port: number;
}

export interface FrameworkOptions {
  emulators: {
    database: ConnectionInfo;
    firestore: ConnectionInfo;
    functions: ConnectionInfo;
    pubsub: ConnectionInfo;
  };
}

export class TriggerEndToEndTest {
  rtdbEmulatorHost = "localhost";
  rtdbEmulatorPort: number;
  firestoreEmulatorHost = "localhost";
  firestoreEmulatorPort: number;
  functionsEmulatorHost = "localhost";
  functionsEmulatorPort: number;
  pubsubEmulatorHost = "localhost";
  pubsubEmulatorPort: number;
  allEmulatorsStarted = false;
  rtdbTriggerCount = 0;
  firestoreTriggerCount = 0;
  pubsubTriggerCount = 0;
  rtdbFromFirestore = false;
  firestoreFromRtdb = false;
  rtdbFromRtdb = false;
  firestoreFromFirestore = false;
  cliProcess?: CLIProcess;

  constructor(public project: string, private readonly workdir: string, config: FrameworkOptions) {
    this.rtdbEmulatorPort = config.emulators.database.port;
    this.firestoreEmulatorPort = config.emulators.firestore.port;
    this.functionsEmulatorPort = config.emulators.functions.port;
    this.pubsubEmulatorPort = config.emulators.pubsub.port;
  }

  /*
   * Check that all directions of database <-> functions <-> firestore
   * worked.
   */
  success(): boolean {
    return (
      this.rtdbFromFirestore &&
      this.rtdbFromRtdb &&
      this.firestoreFromFirestore &&
      this.firestoreFromRtdb
    );
  }

  startEmulators(additionalArgs: string[] = []): Promise<void> {
    const cli = new CLIProcess("default", this.workdir);
    const started = cli.start("emulators:start", this.project, additionalArgs, (data: unknown) => {
      if (typeof data != "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

    cli.process?.stdout.on("data", (data) => {
      if (data.includes(RTDB_FUNCTION_LOG)) {
        this.rtdbTriggerCount++;
      }
      if (data.includes(FIRESTORE_FUNCTION_LOG)) {
        this.firestoreTriggerCount++;
      }
      if (data.includes(PUBSUB_FUNCTION_LOG)) {
        this.pubsubTriggerCount++;
      }
    });

    this.cliProcess = cli;
    return started;
  }

  startEmulatorsAndWait(additionalArgs: string[], done: (_: unknown) => void): void {
    this.startEmulators(additionalArgs).then(done);
  }

  stopEmulators(): Promise<void> {
    return this.cliProcess ? this.cliProcess.stop() : Promise.resolve();
  }

  invokeHttpFunction(name: string): Promise<request.Response> {
    return new Promise((resolve, reject) => {
      const url = `http://localhost:${[
        this.functionsEmulatorPort,
        this.project,
        FIREBASE_PROJECT_ZONE,
        name,
      ].join("/")}`;

      console.log(`URL: ${url}`);
      const req = request.get(url);
      req.once("response", resolve);
      req.once("error", reject);
    });
  }

  writeToRtdb(): Promise<request.Response> {
    return this.invokeHttpFunction("writeToRtdb");
  }

  writeToFirestore(): Promise<request.Response> {
    return this.invokeHttpFunction("writeToFirestore");
  }

  writeToPubsub(): Promise<request.Response> {
    return this.invokeHttpFunction("writeToPubsub");
  }

  writeToScheduledPubsub(): Promise<request.Response> {
    return this.invokeHttpFunction("writeToScheduledPubsub");
  }

  waitForCondition(
    conditionFn: () => boolean,
    timeout: number,
    callback: (err?: Error) => void
  ): void {
    let elapsed = 0;
    const interval = 10;
    const id = setInterval(() => {
      elapsed += interval;
      if (elapsed > timeout) {
        clearInterval(id);
        callback(new Error(`Timed out waiting for condition: ${conditionFn.toString()}}`));
        return;
      }

      if (conditionFn()) {
        clearInterval(id);
        callback();
      }
    }, interval);
  }
}
