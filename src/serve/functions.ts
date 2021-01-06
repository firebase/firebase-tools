import * as path from "path";
import { FunctionsEmulator, FunctionsEmulatorArgs } from "../emulator/functionsEmulator";
import { EmulatorServer } from "../emulator/emulatorServer";
import { parseRuntimeVersion } from "../emulator/functionsEmulatorUtils";
import * as getProjectId from "../getProjectId";

// TODO(samstern): It would be better to convert this to an EmulatorServer
// but we don't have the "options" object until start() is called.
export class FunctionsServer {
  emulatorServer: EmulatorServer | undefined = undefined;

  private assertServer() {
    if (!this.emulatorServer) {
      throw new Error("Must call start() before calling any other operation!");
    }
  }

  async start(options: any, partialArgs: Partial<FunctionsEmulatorArgs>): Promise<void> {
    const projectId = getProjectId(options, false);
    const functionsDir = path.join(
      options.config.projectDir,
      options.config.get("functions.source")
    );
    const nodeMajorVersion = parseRuntimeVersion(options.config.get("functions.runtime"));

    // Normally, these two fields are included in args (and typed as such).
    // However, some poorly-typed tests may not have them and we need to provide
    // default values for those tests to work properly.
    const args: FunctionsEmulatorArgs = {
      projectId,
      functionsDir,
      nodeMajorVersion,
      ...partialArgs,
    };

    if (options.host) {
      args.host = options.host;
    }

    // If hosting emulator is not being served but Functions is,
    // we can use the port argument. Otherwise it goes to hosting and
    // we use port + 1.
    if (options.port) {
      const hostingRunning = options.targets && options.targets.indexOf("hosting") >= 0;
      if (hostingRunning) {
        args.port = options.port + 1;
      } else {
        args.port = options.port;
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

  get(): FunctionsEmulator {
    this.assertServer();
    return this.emulatorServer!.get() as FunctionsEmulator;
  }
}
