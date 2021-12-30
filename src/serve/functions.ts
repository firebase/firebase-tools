import * as path from "path";
import {
  EmulatableBackend,
  FunctionsEmulator,
  FunctionsEmulatorArgs,
} from "../emulator/functionsEmulator";
import { EmulatorServer } from "../emulator/emulatorServer";
import { parseRuntimeVersion } from "../emulator/functionsEmulatorUtils";
import { needProjectId } from "../projectUtils";
import { getProjectDefaultAccount } from "../auth";
import { Options } from "../options";
import { Config } from "../config";
import * as utils from "../utils";

// TODO(samstern): It would be better to convert this to an EmulatorServer
// but we don't have the "options" object until start() is called.
export class FunctionsServer {
  emulatorServer: EmulatorServer | undefined = undefined;
  backend: EmulatableBackend | undefined = undefined;

  private assertServer() {
    if (!this.emulatorServer || !this.backend) {
      throw new Error("Must call start() before calling any other operation!");
    }
  }

  async start(options: Options, partialArgs: Partial<FunctionsEmulatorArgs>): Promise<void> {
    const projectId = needProjectId(options);
    utils.assertDefined(options.config.src.functions);
    utils.assertDefined(
      options.config.src.functions.source,
      "Error: 'functions.source' is not defined"
    );

    const functionsDir = path.join(options.config.projectDir, options.config.src.functions.source);
    const account = getProjectDefaultAccount(options.config.projectDir);
    const nodeMajorVersion = parseRuntimeVersion(options.config.get("functions.runtime"));
    this.backend = {
      functionsDir,
      env: {},
      nodeMajorVersion,
    };
    // Normally, these two fields are included in args (and typed as such).
    // However, some poorly-typed tests may not have them and we need to provide
    // default values for those tests to work properly.
    const args: FunctionsEmulatorArgs = {
      projectId,
      emulatableBackends: [this.backend],
      account,
      ...partialArgs,
    };

    if (options.host) {
      utils.assertIsStringOrUndefined(options.host);
      args.host = options.host;
    }

    // If hosting emulator is not being served but Functions is,
    // we can use the port argument. Otherwise it goes to hosting and
    // we use port + 1.
    if (options.port) {
      utils.assertIsNumber(options.port);
      const targets = options.targets as string[] | undefined;
      const port = options.port;
      const hostingRunning = targets && targets.indexOf("hosting") >= 0;
      if (hostingRunning) {
        args.port = port + 1;
      } else {
        args.port = port;
      }
    }

    this.emulatorServer = new EmulatorServer(new FunctionsEmulator(args));
    await this.emulatorServer.start();
  }

  async connect(): Promise<void> {
    this.assertServer();
    await this.emulatorServer!.connect();
  }

  async stop(): Promise<void> {
    this.assertServer();
    await this.emulatorServer!.stop();
  }

  getBackend(): EmulatableBackend {
    this.assertServer();
    return this.backend!;
  }

  get(): FunctionsEmulator {
    this.assertServer();
    return this.emulatorServer!.get() as FunctionsEmulator;
  }
}
