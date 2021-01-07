import { EmulatorServer } from "../emulator/emulatorServer";
import * as _ from "lodash";
import * as logger from "../logger";

const { FunctionsServer } = require("./functions");

const TARGETS: {
  [key: string]:
    | EmulatorServer
    | { start: (o: any) => void; stop: (o: any) => void; connect: () => void };
} = {
  hosting: require("./hosting"),
  functions: new FunctionsServer(),
};

/**
 * Serve runs the emulators for a set of targets provided in options.
 * @param options Firebase CLI options.
 */
export async function serve(options: any): Promise<void> {
  const targetNames = options.targets;
  options.port = parseInt(options.port, 10);
  await Promise.all(
    _.map(targetNames, (targetName: string) => {
      return TARGETS[targetName].start(options);
    })
  );
  await Promise.all(
    _.map(targetNames, (targetName: string) => {
      return TARGETS[targetName].connect();
    })
  );
  await new Promise((resolve) => {
    process.on("SIGINT", () => {
      logger.info("Shutting down...");
      return Promise.all(
        _.map(targetNames, (targetName: string) => {
          return TARGETS[targetName].stop(options);
        })
      )
        .then(resolve)
        .catch(resolve);
    });
  });
}
