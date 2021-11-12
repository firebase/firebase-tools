import fetch, { Response } from "node-fetch";

import { CLIProcess } from "./cli";

const FIREBASE_PROJECT_ZONE = "us-central1";

/*
 * Markers this test looks for in the emulator process stdout
 * as one test for whether a cloud function was triggered.
 */
/* Functions V2 */
const PUBSUB_FUNCTION_V2_LOG = "========== PUBSUB V2 FUNCTION ==========";
const STORAGE_FUNCTION_V2_ARCHIVED_LOG = "========== STORAGE V2 FUNCTION ARCHIVED ==========";
const STORAGE_FUNCTION_V2_DELETED_LOG = "========== STORAGE V2 FUNCTION DELETED ==========";
const STORAGE_FUNCTION_V2_FINALIZED_LOG = "========== STORAGE V2 FUNCTION FINALIZED ==========";
const STORAGE_FUNCTION_V2_METADATA_LOG = "========== STORAGE V2 FUNCTION METADATA ==========";
/* Functions V1 */
const RTDB_FUNCTION_LOG = "========== RTDB FUNCTION ==========";
const FIRESTORE_FUNCTION_LOG = "========== FIRESTORE FUNCTION ==========";
const PUBSUB_FUNCTION_LOG = "========== PUBSUB FUNCTION ==========";
const AUTH_FUNCTION_LOG = "========== AUTH FUNCTION ==========";
const STORAGE_FUNCTION_ARCHIVED_LOG = "========== STORAGE FUNCTION ARCHIVED ==========";
const STORAGE_FUNCTION_DELETED_LOG = "========== STORAGE FUNCTION DELETED ==========";
const STORAGE_FUNCTION_FINALIZED_LOG = "========== STORAGE FUNCTION FINALIZED ==========";
const STORAGE_FUNCTION_METADATA_LOG = "========== STORAGE FUNCTION METADATA ==========";
const ALL_EMULATORS_STARTED_LOG = "All emulators ready";

interface ConnectionInfo {
  host: string;
  port: number;
}

export interface FrameworkOptions {
  emulators?: {
    database: ConnectionInfo;
    firestore: ConnectionInfo;
    functions: ConnectionInfo;
    pubsub: ConnectionInfo;
    auth: ConnectionInfo;
    storage: ConnectionInfo;
  };
}

export class TriggerEndToEndTest {
  rtdbEmulatorHost = "localhost";
  rtdbEmulatorPort = 0;
  firestoreEmulatorHost = "localhost";
  firestoreEmulatorPort = 0;
  functionsEmulatorHost = "localhost";
  functionsEmulatorPort = 0;
  pubsubEmulatorHost = "localhost";
  pubsubEmulatorPort = 0;
  authEmulatorHost = "localhost";
  authEmulatorPort = 0;
  storageEmulatorHost = "localhost";
  storageEmulatorPort = 0;
  allEmulatorsStarted = false;

  /* Functions V1 */
  rtdbTriggerCount = 0;
  firestoreTriggerCount = 0;
  pubsubTriggerCount = 0;
  authTriggerCount = 0;
  storageArchivedTriggerCount = 0;
  storageDeletedTriggerCount = 0;
  storageFinalizedTriggerCount = 0;
  storageMetadataTriggerCount = 0;

  /* Functions V2 */
  pubsubV2TriggerCount = 0;
  storageV2ArchivedTriggerCount = 0;
  storageV2DeletedTriggerCount = 0;
  storageV2FinalizedTriggerCount = 0;
  storageV2MetadataTriggerCount = 0;

  rtdbFromFirestore = false;
  firestoreFromRtdb = false;
  rtdbFromRtdb = false;
  firestoreFromFirestore = false;
  cliProcess?: CLIProcess;

  constructor(public project: string, private readonly workdir: string, config: FrameworkOptions) {
    if (config.emulators) {
      this.rtdbEmulatorPort = config.emulators.database?.port;
      this.firestoreEmulatorPort = config.emulators.firestore?.port;
      this.functionsEmulatorPort = config.emulators.functions?.port;
      this.pubsubEmulatorPort = config.emulators.pubsub?.port;
      this.authEmulatorPort = config.emulators.auth?.port;
      this.storageEmulatorPort = config.emulators.storage?.port;
    }
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
      /* Functions V1 */
      if (data.includes(RTDB_FUNCTION_LOG)) {
        this.rtdbTriggerCount++;
      }
      if (data.includes(FIRESTORE_FUNCTION_LOG)) {
        this.firestoreTriggerCount++;
      }
      if (data.includes(PUBSUB_FUNCTION_LOG)) {
        this.pubsubTriggerCount++;
      }
      if (data.includes(AUTH_FUNCTION_LOG)) {
        this.authTriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_ARCHIVED_LOG)) {
        this.storageArchivedTriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_DELETED_LOG)) {
        this.storageDeletedTriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_FINALIZED_LOG)) {
        this.storageFinalizedTriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_METADATA_LOG)) {
        this.storageMetadataTriggerCount++;
      }
      /* Functions V2 */
      if (data.includes(PUBSUB_FUNCTION_V2_LOG)) {
        this.pubsubV2TriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_V2_ARCHIVED_LOG)) {
        this.storageV2ArchivedTriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_V2_DELETED_LOG)) {
        this.storageV2DeletedTriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_V2_FINALIZED_LOG)) {
        this.storageV2FinalizedTriggerCount++;
      }
      if (data.includes(STORAGE_FUNCTION_V2_METADATA_LOG)) {
        this.storageV2MetadataTriggerCount++;
      }
    });

    this.cliProcess = cli;
    return started;
  }

  startExtEmulators(additionalArgs: string[]): Promise<void> {
    const cli = new CLIProcess("default", this.workdir);
    const started = cli.start(
      "ext:dev:emulators:start",
      this.project,
      additionalArgs,
      (data: unknown) => {
        if (typeof data != "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(ALL_EMULATORS_STARTED_LOG);
      }
    );

    this.cliProcess = cli;
    return started;
  }

  stopEmulators(): Promise<void> {
    return this.cliProcess ? this.cliProcess.stop() : Promise.resolve();
  }

  invokeHttpFunction(name: string, zone = FIREBASE_PROJECT_ZONE): Promise<Response> {
    const url = `http://localhost:${[this.functionsEmulatorPort, this.project, zone, name].join(
      "/"
    )}`;
    return fetch(url);
  }

  writeToRtdb(): Promise<Response> {
    return this.invokeHttpFunction("writeToRtdb");
  }

  writeToFirestore(): Promise<Response> {
    return this.invokeHttpFunction("writeToFirestore");
  }

  writeToPubsub(): Promise<Response> {
    return this.invokeHttpFunction("writeToPubsub");
  }

  writeToAuth(): Promise<Response> {
    return this.invokeHttpFunction("writeToAuth");
  }

  writeToScheduledPubsub(): Promise<Response> {
    return this.invokeHttpFunction("writeToScheduledPubsub");
  }

  writeToStorage(): Promise<Response> {
    return this.invokeHttpFunction("writeToStorage");
  }

  updateDeleteFromStorage(): Promise<Response> {
    return this.invokeHttpFunction("updateDeleteFromStorage");
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
