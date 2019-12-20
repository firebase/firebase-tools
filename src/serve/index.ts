import { EmulatorServer } from "../emulator/emulatorServer";
import * as _ from "lodash";
import * as logger from "../logger";

const TARGETS: {
  [key: string]:
    | EmulatorServer
    | { start: (o: any) => void; stop: (o: any) => void; connect: () => void };
} = {
  hosting: require("./hosting"),
  functions: require("./functions"),
  database: require("./database"),
  firestore: require("./firestore"),
};

const _serve = async function(options: any) {
  const targetNames = options.targets;
  options.port = parseInt(options.port, 10);
  await Promise.all(
    _.map(targetNames, function(targetName: string) {
      const target = TARGETS[targetName];
      return target.start(options);
    })
  );
  await Promise.all(
    _.map(targetNames, function(targetName: string) {
      const target = TARGETS[targetName];
      return target.connect();
    })
  );
  await new Promise(function(resolve) {
    process.on("SIGINT", function() {
      logger.info("Shutting down...");
      return Promise.all(
        _.map(targetNames, function(targetName: string) {
          const target = TARGETS[targetName];
          return target.stop(options);
        })
      )
        .then(resolve)
        .catch(resolve);
    });
  });
};

export = _serve;
