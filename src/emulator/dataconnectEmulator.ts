import * as childProcess from "child_process";
import { EventEmitter } from "events";

import { dataConnectLocalConnString } from "../api";
import { Constants } from "./constants";
import { getPID, start, stop, downloadIfNecessary } from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators, ListenSpec } from "./types";
import { FirebaseError } from "../error";
import { EmulatorLogger } from "./emulatorLogger";
import { RC } from "../rc";
import { BuildResult, requiresVector } from "../dataconnect/types";
import { listenSpecsToString } from "./portUtils";
import { Client, ClientResponse } from "../apiv2";
import { EmulatorRegistry } from "./registry";
import { logger } from "../logger";
import { load } from "../dataconnect/load";
import { Config } from "../config";
import { PostgresServer } from "./dataconnect/pgliteServer";
import { cleanShutdown } from "./controller";
import { connectableHostname } from "../utils";

export interface DataConnectEmulatorArgs {
  projectId: string;
  listen: ListenSpec[];
  configDir: string;
  auto_download?: boolean;
  rc: RC;
  config: Config;
  autoconnectToPostgres: boolean;
  postgresListen?: ListenSpec[];
  enable_output_schema_extensions: boolean;
  enable_output_generated_sdk: boolean;
}

export interface DataConnectGenerateArgs {
  configDir: string;
  connectorId: string;
  watch?: boolean;
}

export interface DataConnectBuildArgs {
  configDir: string;
}

// TODO: More concrete typing for events. Can we use string unions?
export const dataConnectEmulatorEvents = new EventEmitter();

export class DataConnectEmulator implements EmulatorInstance {
  private emulatorClient: DataConnectEmulatorClient;
  private usingExistingEmulator: boolean = false;

  constructor(private args: DataConnectEmulatorArgs) {
    this.emulatorClient = new DataConnectEmulatorClient();
  }
  private logger = EmulatorLogger.forEmulator(Emulators.DATACONNECT);

  async start(): Promise<void> {
    let resolvedConfigDir;
    try {
      resolvedConfigDir = this.args.config.path(this.args.configDir);

      const info = await DataConnectEmulator.build({ configDir: resolvedConfigDir });
      if (requiresVector(info.metadata)) {
        if (Constants.isDemoProject(this.args.projectId)) {
          this.logger.logLabeled(
            "WARN",
            "Data Connect",
            "Detected a 'demo-' project, but vector embeddings require a real project. Operations that use vector_embed will fail.",
          );
        } else {
          this.logger.logLabeled(
            "WARN",
            "Data Connect",
            "Operations that use vector_embed will make calls to production Vertex AI",
          );
        }
      }
    } catch (err: any) {
      this.logger.log("DEBUG", `'fdc build' failed with error: ${err.message}`);
    }

    const info = await load(this.args.projectId, this.args.config, this.args.configDir);
    const dbId = info.dataConnectYaml.schema.datasource.postgresql?.database || "postgres";
    const serviceId = info.dataConnectYaml.serviceId;
    await start(Emulators.DATACONNECT, {
      auto_download: this.args.auto_download,
      listen: listenSpecsToString(this.args.listen),
      config_dir: resolvedConfigDir,
      enable_output_schema_extensions: this.args.enable_output_schema_extensions,
      enable_output_generated_sdk: this.args.enable_output_generated_sdk,
    });
    this.usingExistingEmulator = false;
    if (this.args.autoconnectToPostgres) {
      const pgPort = this.args.postgresListen?.[0].port;
      const pgHost = this.args.postgresListen?.[0].address;
      let connStr = dataConnectLocalConnString();
      if (dataConnectLocalConnString()) {
        this.logger.logLabeled(
          "INFO",
          "Data Connect",
          `FIREBASE_DATACONNECT_POSTGRESQL_STRING is set to ${dataConnectLocalConnString()} - using that instead of starting a new database`,
        );
      } else if (pgHost && pgPort) {
        const pgServer = new PostgresServer(dbId, "postgres");
        const server = await pgServer.createPGServer(pgHost, pgPort);
        const connectableHost = connectableHostname(pgHost);
        connStr = `postgres://${connectableHost}:${pgPort}/${dbId}?sslmode=disable`;
        server.on("error", (err) => {
          if (err instanceof FirebaseError) {
            this.logger.logLabeled("ERROR", "Data Connect", `${err}`);
          } else {
            this.logger.logLabeled(
              "ERROR",
              "Data Connect",
              `Postgres threw an unexpected error, shutting down the Data Connect emulator: ${err}`,
            );
          }
          void cleanShutdown();
        });
        this.logger.logLabeled(
          "INFO",
          "Data Connect",
          `Started up Postgres server, listening on ${server.address()?.toString()}`,
        );
      }
      await this.connectToPostgres(new URL(connStr), dbId, serviceId);
    }
    return;
  }

  async connect(): Promise<void> {
    // TODO: Wait for 'Listening on address (HTTP + gRPC)' message to ensure that emulator binary is fully started.
    const emuInfo = await this.emulatorClient.getInfo();
    if (!emuInfo) {
      this.logger.logLabeled(
        "ERROR",
        "Data Connect",
        "Could not connect to Data Connect emulator. Check dataconnect-debug.log for more details.",
      );
      return Promise.reject();
    }
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this.usingExistingEmulator) {
      this.logger.logLabeled(
        "INFO",
        "Data Connect",
        "Skipping cleanup of Data Connect emulator, as it was not started by this process.",
      );
      return;
    }
    return stop(Emulators.DATACONNECT);
  }

  getInfo(): EmulatorInfo {
    return {
      name: this.getName(),
      listen: this.args.listen,
      host: this.args.listen[0].address,
      port: this.args.listen[0].port,
      pid: getPID(Emulators.DATACONNECT),
      timeout: 10_000,
    };
  }

  getName(): Emulators {
    return Emulators.DATACONNECT;
  }

  static async generate(args: DataConnectGenerateArgs): Promise<string> {
    const commandInfo = await downloadIfNecessary(Emulators.DATACONNECT);
    const cmd = [
      "--logtostderr",
      "-v=2",
      "generate",
      `--config_dir=${args.configDir}`,
      `--connector_id=${args.connectorId}`,
    ];
    if (args.watch) {
      cmd.push("--watch");
    }
    const res = childProcess.spawnSync(commandInfo.binary, cmd, { encoding: "utf-8" });

    logger.info(res.stderr);
    if (res.error) {
      throw new FirebaseError(`Error starting up Data Connect generate: ${res.error.message}`, {
        original: res.error,
      });
    }
    if (res.status !== 0) {
      throw new FirebaseError(
        `Unable to generate your Data Connect SDKs (exit code ${res.status}): ${res.stderr}`,
      );
    }
    return res.stdout;
  }

  static async build(args: DataConnectBuildArgs): Promise<BuildResult> {
    const commandInfo = await downloadIfNecessary(Emulators.DATACONNECT);
    const cmd = ["--logtostderr", "-v=2", "build", `--config_dir=${args.configDir}`];

    const res = childProcess.spawnSync(commandInfo.binary, cmd, { encoding: "utf-8" });
    if (res.error) {
      throw new FirebaseError(`Error starting up Data Connect build: ${res.error.message}`, {
        original: res.error,
      });
    }
    if (res.status !== 0) {
      throw new FirebaseError(
        `Unable to build your Data Connect schema and connectors (exit code ${res.status}): ${res.stderr}`,
      );
    }

    if (res.stderr) {
      EmulatorLogger.forEmulator(Emulators.DATACONNECT).log("DEBUG", res.stderr);
    }

    try {
      return JSON.parse(res.stdout) as BuildResult;
    } catch (err) {
      // JSON parse errors are unreadable.
      throw new FirebaseError(`Unable to parse 'fdc build' output: ${res.stdout ?? res.stderr}`);
    }
  }

  public async connectToPostgres(
    connectionString: URL,
    database?: string,
    serviceId?: string,
  ): Promise<boolean> {
    if (!connectionString) {
      const msg = `No Postgres connection found. The Data Connect emulator will not be able to execute operations.`;
      throw new FirebaseError(msg);
    }
    // The Data Connect emulator does not immediately start listening after started
    // so we retry this call with a brief backoff.
    const MAX_RETRIES = 3;
    for (let i = 1; i <= MAX_RETRIES; i++) {
      try {
        this.logger.logLabeled("DEBUG", "Data Connect", `Connecting to ${connectionString}}...`);
        connectionString.toString();
        await this.emulatorClient.configureEmulator({
          connectionString: connectionString.toString(),
          database,
          serviceId,
          maxOpenConnections: 1, // PGlite only supports a single open connection at a time - otherwise, prepared statements will misbehave.
        });
        this.logger.logLabeled(
          "DEBUG",
          "Data Connect",
          `Successfully connected to ${connectionString}}`,
        );
        return true;
      } catch (err: any) {
        if (i === MAX_RETRIES) {
          throw err;
        }
        this.logger.logLabeled(
          "DEBUG",
          "Data Connect",
          `Retrying connectToPostgress call (${i} of ${MAX_RETRIES} attempts): ${err}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return false;
  }
}

type ConfigureEmulatorRequest = {
  // Defaults to the local service in dataconnect.yaml if not provided
  serviceId?: string;
  // The Postgres connection string to connect the new service to. This is
  // required in order to configure the emulator service.
  connectionString: string;
  // The Postgres database to connect the new service to. If this field is
  // populated, then any database specified in the connection_string will be
  // overwritten.
  database?: string;
  // The max number of simultaneous Postgres connections the emulator may open
  maxOpenConnections?: number;
};

type GetInfoResponse = {
  // Version number of the emulator.
  version: string;
  // List of services currently running on the emulator.
  services: {
    // ID of this service.
    serviceId: string;
    // The Postgres connection string that this service uses.
    connectionString: string;
  }[];
};

export class DataConnectEmulatorClient {
  private client: Client | undefined = undefined;

  public async configureEmulator(body: ConfigureEmulatorRequest): Promise<ClientResponse<void>> {
    if (!this.client) {
      this.client = EmulatorRegistry.client(Emulators.DATACONNECT);
    }
    try {
      const res = await this.client.post<ConfigureEmulatorRequest, void>(
        "emulator/configure",
        body,
      );
      return res;
    } catch (err: any) {
      if (err.status === 500) {
        throw new FirebaseError(`Data Connect emulator: ${err?.context?.body?.message}`);
      }
      throw err;
    }
  }

  public async getInfo(): Promise<GetInfoResponse | void> {
    if (!this.client) {
      this.client = EmulatorRegistry.client(Emulators.DATACONNECT);
    }
    return getInfo(this.client);
  }
}

async function getInfo(client: Client): Promise<GetInfoResponse | void> {
  try {
    const res = await client.get<GetInfoResponse>("emulator/info");
    return res.body;
  } catch (err) {
    return;
  }
}
