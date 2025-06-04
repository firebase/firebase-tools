import * as path from "path";
import {
  EmulatableBackend,
  FunctionsEmulator,
  FunctionsEmulatorArgs,
} from "../emulator/functionsEmulator";
import { needProjectId } from "../projectUtils";
import { getProjectDefaultAccount } from "../auth";
import { Options } from "../options";
import * as projectConfig from "../functions/projectConfig";
import * as utils from "../utils";
import { EmulatorRegistry } from "../emulator/registry";
import { parseInspectionPort } from "../emulator/commandUtils";

export class FunctionsServer {
  emulator?: FunctionsEmulator;
  backends?: EmulatableBackend[];

  private assertServer(): FunctionsEmulator {
    if (!this.emulator || !this.backends) {
      throw new Error("Must call start() before calling any other operation!");
    }
    return this.emulator;
  }

  async start(options: Options, partialArgs: Partial<FunctionsEmulatorArgs>): Promise<void> {
    const projectId = needProjectId(options);
    const config = projectConfig.normalizeAndValidate(options.config.src.functions);

    const backends: EmulatableBackend[] = [];
    for (const cfg of config) {
      const functionsDir = path.join(options.config.projectDir, cfg.source);
      backends.push({
        functionsDir,
        codebase: cfg.codebase,
        runtime: cfg.runtime,
        env: {},
        secretEnv: [],
      });
    }
    this.backends = backends;

    const account = getProjectDefaultAccount(options.config.projectDir);
    const args: FunctionsEmulatorArgs = {
      projectId,
      projectDir: options.config.projectDir,
      emulatableBackends: this.backends,
      projectAlias: options.projectAlias,
      account,
      ...partialArgs,
      // Non-optional; parseInspectionPort will set to false if missing.
      debugPort: parseInspectionPort(options),
    };

    // Normally, these two fields are included in args (and typed as such).
    // However, some poorly-typed tests may not have them and we need to provide
    // default values for those tests to work properly.
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
      const hostingRunning = targets && targets.includes("hosting");
      if (hostingRunning) {
        args.port = port + 1;
      } else {
        args.port = port;
      }
    }

    this.emulator = new FunctionsEmulator(args);
    return EmulatorRegistry.start(this.emulator);
  }

  async connect(): Promise<void> {
    await this.assertServer().connect();
  }

  async stop(): Promise<void> {
    await this.assertServer().stop();
  }

  get(): FunctionsEmulator {
    return this.assertServer();
  }
}
