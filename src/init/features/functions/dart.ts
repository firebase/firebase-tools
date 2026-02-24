import * as spawn from "cross-spawn";
import { Config } from "../../../config";
import { confirm } from "../../../prompt";
import { latest } from "../../../deploy/functions/runtimes/supported";

// TODO(ehesp): Create these template files in templates/init/functions/dart/
// TODO(ehesp): Dont use relative path for firebase_functions
const PUBSPEC_TEMPLATE = `name: functions
description: Firebase Functions for Dart
version: 1.0.0

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  firebase_functions:
    path: ../

dev_dependencies:
  build_runner: ^2.4.0
`;

const MAIN_TEMPLATE = `import 'package:firebase_functions/firebase_functions.dart';

void main(List<String> args) {
  fireUp(args, (firebase) {

    firebase.https.onRequest(
      name: 'helloWorld',
      options: const HttpsOptions(cors: Cors(['*'])),
      (request) async {
        return Response(200, body: 'Hello from Dart Functions!');
      });
  });
}
`;

const GITIGNORE_TEMPLATE = `.dart_tool/
build/
*.dart.js
*.info.json
*.js
*.js.map
*.js.deps
*.js.symbols
firebase-debug.log
firebase-debug.*.log
*.local
`;

/**
 * Create a Dart Firebase Functions project.
 */
export async function setup(setup: any, config: Config): Promise<void> {
  await config.askWriteProjectFile(`${setup.functions.source}/pubspec.yaml`, PUBSPEC_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/lib/main.dart`, MAIN_TEMPLATE);

  // Write the latest supported runtime version to the config.
  config.set("functions.runtime", latest("dart"));
  // Add dart specific ignores to config.
  config.set("functions.ignore", [".dart_tool", "build"]);

  const install = await confirm({
    message: "Do you want to install dependencies now?",
    default: true,
  });
  if (install) {
    const installProcess = spawn("dart", ["pub", "get"], {
      cwd: config.path(setup.functions.source),
      stdio: ["inherit", "inherit", "inherit"],
    });
    await new Promise((resolve, reject) => {
      installProcess.on("exit", resolve);
      installProcess.on("error", reject);
    });
  }
}
