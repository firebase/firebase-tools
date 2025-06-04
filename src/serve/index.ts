import { logger } from "../logger";
import { prepareFrameworks } from "../frameworks";
import * as experiments from "../experiments";
import { trackEmulator } from "../track";
import { getProjectId } from "../projectUtils";
import { Constants } from "../emulator/constants";
import * as config from "../hosting/config";

const { FunctionsServer } = require("./functions");

const TARGETS: {
  [key: string]: { start: (o: any) => void; stop: (o: any) => void; connect: () => void };
} = {
  hosting: require("./hosting"),
  functions: new FunctionsServer(),
};

/**
 * Serve runs the emulators for a set of targets provided in options.
 * @param options Firebase CLI options.
 */
export async function serve(options: any): Promise<void> {
  options.targets ||= [];
  const targetNames: string[] = options.targets;
  options.port = parseInt(options.port, 10);
  if (targetNames.includes("hosting") && config.extract(options).some((it: any) => it.source)) {
    experiments.assertEnabled("webframeworks", "emulate a web framework");
    await prepareFrameworks("emulate", targetNames, undefined, options);
  }
  const isDemoProject = Constants.isDemoProject(getProjectId(options) || "");
  targetNames.forEach((targetName) => {
    void trackEmulator("emulator_run", {
      emulator_name: targetName,
      is_demo_project: String(isDemoProject),
    });
  });
  await Promise.all(
    targetNames.map((targetName: string) => {
      return TARGETS[targetName].start(options);
    }),
  );
  await Promise.all(
    targetNames.map((targetName: string) => {
      return TARGETS[targetName].connect();
    }),
  );
  void trackEmulator("emulators_started", {
    count: targetNames.length,
    count_all: targetNames.length,
    is_demo_project: String(isDemoProject),
  });
  await new Promise((resolve) => {
    process.on("SIGINT", () => {
      logger.info("Shutting down...");
      Promise.all(
        targetNames.map((targetName: string) => {
          return TARGETS[targetName].stop(options);
        }),
      )
        .then(resolve)
        .catch(resolve);
    });
  });
}
