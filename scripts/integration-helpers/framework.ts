import fetch, { Response } from "node-fetch";

import { CLIProcess } from "./cli";
import { Emulators } from "../../src/emulator/types";

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
const STORAGE_BUCKET_FUNCTION_V2_ARCHIVED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION ARCHIVED ==========";
const STORAGE_BUCKET_FUNCTION_V2_DELETED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION DELETED ==========";
const STORAGE_BUCKET_FUNCTION_V2_FINALIZED_LOG =
  "========== STORAGE BUCKET V2 FUNCTION FINALIZED ==========";
const STORAGE_BUCKET_FUNCTION_V2_METADATA_LOG =
  "========== STORAGE BUCKET V2 FUNCTION METADATA ==========";
/* Functions V1 */
const RTDB_FUNCTION_LOG = "========== RTDB FUNCTION ==========";
const FIRESTORE_FUNCTION_LOG = "========== FIRESTORE FUNCTION ==========";
const PUBSUB_FUNCTION_LOG = "========== PUBSUB FUNCTION ==========";
const AUTH_FUNCTION_LOG = "========== AUTH FUNCTION ==========";
const STORAGE_FUNCTION_ARCHIVED_LOG = "========== STORAGE FUNCTION ARCHIVED ==========";
const STORAGE_FUNCTION_DELETED_LOG = "========== STORAGE FUNCTION DELETED ==========";
const STORAGE_FUNCTION_FINALIZED_LOG = "========== STORAGE FUNCTION FINALIZED ==========";
const STORAGE_FUNCTION_METADATA_LOG = "========== STORAGE FUNCTION METADATA ==========";
const STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG =
  "========== STORAGE BUCKET FUNCTION ARCHIVED ==========";
const STORAGE_BUCKET_FUNCTION_DELETED_LOG = "========== STORAGE BUCKET FUNCTION DELETED ==========";
const STORAGE_BUCKET_FUNCTION_FINALIZED_LOG =
  "========== STORAGE BUCKET FUNCTION FINALIZED ==========";
const STORAGE_BUCKET_FUNCTION_METADATA_LOG =
  "========== STORAGE BUCKET FUNCTION METADATA ==========";
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
  storageBucketArchivedTriggerCount = 0;
  storageBucketDeletedTriggerCount = 0;
  storageBucketFinalizedTriggerCount = 0;
  storageBucketMetadataTriggerCount = 0;

  /* Functions V2 */
  pubsubV2TriggerCount = 0;
  storageV2ArchivedTriggerCount = 0;
  storageV2DeletedTriggerCount = 0;
  storageV2FinalizedTriggerCount = 0;
  storageV2MetadataTriggerCount = 0;
  storageBucketV2ArchivedTriggerCount = 0;
  storageBucketV2DeletedTriggerCount = 0;
  storageBucketV2FinalizedTriggerCount = 0;
  storageBucketV2MetadataTriggerCount = 0;

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

  resetCounts(): void {
    /* Functions V1 */
    this.firestoreTriggerCount = 0;
    this.rtdbTriggerCount = 0;
    this.pubsubTriggerCount = 0;
    this.authTriggerCount = 0;
    this.storageArchivedTriggerCount = 0;
    this.storageDeletedTriggerCount = 0;
    this.storageFinalizedTriggerCount = 0;
    this.storageMetadataTriggerCount = 0;
    this.storageBucketArchivedTriggerCount = 0;
    this.storageBucketDeletedTriggerCount = 0;
    this.storageBucketFinalizedTriggerCount = 0;
    this.storageBucketMetadataTriggerCount = 0;

    /* Functions V2 */
    this.pubsubV2TriggerCount = 0;
    this.storageV2ArchivedTriggerCount = 0;
    this.storageV2DeletedTriggerCount = 0;
    this.storageV2FinalizedTriggerCount = 0;
    this.storageV2MetadataTriggerCount = 0;
    this.storageBucketV2ArchivedTriggerCount = 0;
    this.storageBucketV2DeletedTriggerCount = 0;
    this.storageBucketV2FinalizedTriggerCount = 0;
    this.storageBucketV2MetadataTriggerCount = 0;
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
      if (typeof data !== "string" && !Buffer.isBuffer(data)) {
        throw new Error(`data is not a string or buffer (${typeof data})`);
      }
      return data.includes(ALL_EMULATORS_STARTED_LOG);
    });

    cli.process?.stdout?.on("data", (data) => {
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
      if (data.includes(STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG)) {
        this.storageBucketArchivedTriggerCount++;
      }
      if (data.includes(STORAGE_BUCKET_FUNCTION_DELETED_LOG)) {
        this.storageBucketDeletedTriggerCount++;
      }
      if (data.includes(STORAGE_BUCKET_FUNCTION_FINALIZED_LOG)) {
        this.storageBucketFinalizedTriggerCount++;
      }
      if (data.includes(STORAGE_BUCKET_FUNCTION_METADATA_LOG)) {
        this.storageBucketMetadataTriggerCount++;
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
      if (data.includes(STORAGE_BUCKET_FUNCTION_V2_ARCHIVED_LOG)) {
        this.storageBucketV2ArchivedTriggerCount++;
      }
      if (data.includes(STORAGE_BUCKET_FUNCTION_V2_DELETED_LOG)) {
        this.storageBucketV2DeletedTriggerCount++;
      }
      if (data.includes(STORAGE_BUCKET_FUNCTION_V2_FINALIZED_LOG)) {
        this.storageBucketV2FinalizedTriggerCount++;
      }
      if (data.includes(STORAGE_BUCKET_FUNCTION_V2_METADATA_LOG)) {
        this.storageBucketV2MetadataTriggerCount++;
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
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
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

  applyTargets(emulatorType: Emulators, target: string, resource: string): Promise<void> {
    const cli = new CLIProcess("default", this.workdir);
    const started = cli.start(
      "target:apply",
      this.project,
      [emulatorType, target, resource],
      (data: unknown) => {
        if (typeof data !== "string" && !Buffer.isBuffer(data)) {
          throw new Error(`data is not a string or buffer (${typeof data})`);
        }
        return data.includes(`Applied ${emulatorType} target`);
      }
    );
    this.cliProcess = cli;
    return started;
  }

  invokeHttpFunction(name: string, zone = FIREBASE_PROJECT_ZONE): Promise<Response> {
    const url = `http://localhost:${[this.functionsEmulatorPort, this.project, zone, name].join(
      "/"
    )}`;
    return fetch(url);
  }

  invokeCallableFunction(
    name: string,
    body: Record<string, unknown>,
    zone = FIREBASE_PROJECT_ZONE
  ): Promise<Response> {
    const url = `http://localhost:${this.functionsEmulatorPort}/${[this.project, zone, name].join(
      "/"
    )}`;
    return fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
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

  writeToDefaultStorage(): Promise<Response> {
    return this.invokeHttpFunction("writeToDefaultStorage");
  }

  writeToSpecificStorageBucket(): Promise<Response> {
    return this.invokeHttpFunction("writeToSpecificStorageBucket");
  }

  updateMetadataDefaultStorage(): Promise<Response> {
    return this.invokeHttpFunction("updateMetadataFromDefaultStorage");
  }

  updateMetadataSpecificStorageBucket(): Promise<Response> {
    return this.invokeHttpFunction("updateMetadataFromSpecificStorageBucket");
  }

  updateDeleteFromDefaultStorage(): Promise<Response> {
    return this.invokeHttpFunction("updateDeleteFromDefaultStorage");
  }

  updateDeleteFromSpecificStorageBucket(): Promise<Response> {
    return this.invokeHttpFunction("updateDeleteFromSpecificStorageBucket");
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
