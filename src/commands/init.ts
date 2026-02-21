import * as clc from "colorette";
import * as os from "os";
import * as path from "path";

import { Command } from "../command";
import { Config } from "../config";
import { getAllAccounts } from "../auth";
import { init, Setup } from "../init";
import { logger } from "../logger";
import { checkbox, confirm } from "../prompt";
import * as fsutils from "../fsutils";
import * as utils from "../utils";
import { Options } from "../options";
import { isEnabled } from "../experiments";
import { readTemplateSync } from "../templates";
import { FirebaseError } from "../error";
import { logBullet } from "../utils";

const homeDir = os.homedir();

const BANNER_TEXT = readTemplateSync("banner.txt");
const GITIGNORE_TEMPLATE = readTemplateSync("_gitignore");

function isOutside(from: string, to: string): boolean {
  return !!/^\.\./.exec(path.relative(from, to));
}

let choices: {
  value: string;
  name: string;
  checked: boolean;
  hidden?: boolean;
}[] = [
  {
    value: "dataconnect",
    name: "Data Connect: Set up a Firebase Data Connect service",
    checked: false,
  },
  {
    value: "firestore",
    name: "Firestore: Configure security rules and indexes files for Firestore",
    checked: false,
  },
  {
    value: "functions",
    name: "Functions: Configure a Cloud Functions directory and its files",
    checked: false,
  },
  {
    value: "apphosting",
    name: "App Hosting: Set up deployments for full-stack web apps (supports server-side rendering)",
    checked: false,
    hidden: false,
  },
  {
    value: "hosting",
    name: "Hosting: Set up deployments for static web apps",
    checked: false,
  },
  {
    value: "storage",
    name: "Storage: Configure a security rules file for Cloud Storage",
    checked: false,
  },
  {
    value: "emulators",
    name: "Emulators: Set up local emulators for Firebase products",
    checked: false,
  },
  {
    value: "remoteconfig",
    name: "Remote Config: Configure a template file for Remote Config",
    checked: false,
  },
  {
    value: "extensions",
    name: "Extensions: Set up an empty Extensions manifest",
    checked: false,
  },
  {
    value: "database",
    name: "Realtime Database: Configure a security rules file for Realtime Database and (optionally) provision default instance",
    checked: false,
  },
  {
    value: "hosting:github",
    name: "Hosting: Set up GitHub Action deploys",
    checked: false,
    hidden: true,
  },
  {
    value: "dataconnect:sdk",
    name: "Data Connect: Set up a generated SDK for your Firebase Data Connect service",
    checked: false,
    hidden: true,
  },
  {
    value: "auth",
    name: "Authentication: Set up Firebase Authentication",
    checked: false,
  },
];

if (isEnabled("fdcwebhooks")) {
  choices.push({
    value: "dataconnect:resolver",
    name: "Data Connect: Set up a custom resolver for your Firebase Data Connect service",
    checked: false,
    hidden: true,
  });
}

if (isEnabled("genkit")) {
  choices = [
    ...choices.slice(0, 2),
    {
      value: "genkit",
      name: "Genkit: Setup a new Genkit project with Firebase",
      checked: false,
    },
    ...choices.slice(2),
  ];
}

if (isEnabled("apptesting")) {
  choices.push({
    value: "apptesting",
    name: "App Testing: create a smoke test, enable Cloud APIs (storage, run, & artifactregistry), and add a service account.",
    checked: false,
  });
}

choices.push({
  value: "ailogic",
  name: "AI Logic: Set up Firebase AI Logic with app provisioning",
  checked: false,
});

choices.push({
  value: "aitools",
  name: "AI Tools: Configure AI coding assistants to work with your Firebase project",
  checked: false,
  hidden: true,
});

const featureNames = choices.map((choice) => choice.value);

const HELP = `Interactively configure the current directory as a Firebase project or initialize new features in an already configured Firebase project directory.

This command will create or update 'firebase.json' and '.firebaserc' configuration files in the current directory.

To initialize a specific Firebase feature, run 'firebase init [feature]'. Valid features are:
${[...featureNames]
  .sort()
  .map((n) => `\n  - ${n}`)
  .join("")}`;

export const command = new Command("init [feature]")
  .description("interactively configure the current directory as a Firebase project directory")
  .help(HELP)
  .action(initAction);

/**
 * Init command action
 * @param feature Feature to init (e.g., hosting, functions)
 * @param options Command options
 */
export async function initAction(feature: string, options: Options): Promise<void> {
  if (feature && !featureNames.includes(feature)) {
    return utils.reject(
      clc.bold(feature) +
        " is not a supported feature; must be one of " +
        featureNames.join(", ") +
        ".",
    );
  }

  const cwd = options.cwd || process.cwd();

  const warnings = [];
  let warningText = "";
  if (isOutside(homeDir, cwd)) {
    warnings.push("You are currently outside your home directory");
  }
  if (cwd === homeDir) {
    warnings.push("You are initializing your home directory as a Firebase project directory");
  }

  const existingConfig = Config.load(options, true);
  if (existingConfig) {
    warnings.push("You are initializing within an existing Firebase project directory");
  }

  const config =
    existingConfig !== null ? existingConfig : new Config({}, { projectDir: cwd, cwd: cwd });

  if (warnings.length) {
    warningText =
      "\nBefore we get started, keep in mind:\n\n  " +
      clc.yellow(clc.bold("* ")) +
      warnings.join("\n  " + clc.yellow(clc.bold("* "))) +
      "\n";
  }

  logger.info(
    clc.yellow(clc.bold(BANNER_TEXT)) +
      "\nYou're about to initialize a Firebase project in this directory:\n\n  " +
      clc.bold(config.projectDir) +
      "\n" +
      warningText,
  );

  const setup: Setup = {
    config: config.src,
    rcfile: config.readProjectFile(".firebaserc", {
      json: true,
      fallback: {},
    }),
    instructions: [],
  };

  // HACK: Windows Node has issues with selectables as the first prompt, so we
  // add an extra confirmation prompt that fixes the problem
  // TODO: see if this issue still persists in the new prompt library.
  if (process.platform === "win32") {
    if (!(await confirm("Are you ready to proceed?"))) {
      throw new FirebaseError("Aborted by user.", { exit: 1 });
    }
  }

  if (feature) {
    setup.featureArg = true;
    setup.features = [feature];
  } else {
    setup.features = await checkbox<string>({
      message:
        "Which Firebase features do you want to set up for this directory? " +
        "Press Space to select features, then Enter to confirm your choices.",
      choices: choices.filter((c) => !c.hidden),
      validate: (choices) => {
        if (choices.length === 0) {
          return (
            "Must select at least one feature. Use " +
            clc.bold(clc.underline("SPACEBAR")) +
            " to select features, or specify a feature by running " +
            clc.bold("firebase init [feature_name]")
          );
        }
        return true;
      },
    });
  }
  if (!setup.features || setup.features?.length === 0) {
    throw new FirebaseError(
      "Must select at least one feature. Use " +
        clc.bold(clc.underline("SPACEBAR")) +
        " to select features, or specify a feature by running " +
        clc.bold("firebase init [feature_name]"),
    );
  }

  // Always set up project
  setup.features.unshift("project");

  // If there is more than one account, add an account choice phase
  const allAccounts = getAllAccounts();
  if (allAccounts.length > 1) {
    setup.features.unshift("account");
  }

  // "hosting:github" is a part of "hosting", so if both are selected, "hosting:github" is ignored.
  if (setup.features.includes("hosting") && setup.features.includes("hosting:github")) {
    setup.features = setup.features.filter((f) => f !== "hosting:github");
  }
  // "dataconnect:sdk" is a part of "dataconnect", so if both are selected, "dataconnect:sdk" is ignored.
  if (setup.features.includes("dataconnect") && setup.features.includes("dataconnect:sdk")) {
    setup.features = setup.features.filter((f) => f !== "dataconnect:sdk");
  }

  await init(setup, config, options);
  await postInitSaves(setup, config);

  if (setup.instructions.length) {
    logger.info(`\n${clc.bold("To get started:")}\n`);
    for (const i of setup.instructions) {
      logBullet(i + "\n");
    }
  }
}

export async function postInitSaves(setup: Setup, config: Config): Promise<void> {
  logger.info();
  config.writeProjectFile("firebase.json", setup.config);
  config.writeProjectFile(".firebaserc", setup.rcfile);
  if (!fsutils.fileExistsSync(config.path(".gitignore"))) {
    config.writeProjectFile(".gitignore", GITIGNORE_TEMPLATE);
  }
  logger.info();
  utils.logSuccess("Firebase initialization complete!");
}
