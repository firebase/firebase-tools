"use strict";

var clc = require("cli-color");
var fs = require("fs");
var homeDir = require("os").homedir();
var path = require("path");

var { Command } = require("../command");
var { Config } = require("../config");
var fsutils = require("../fsutils");
var { init } = require("../init");
const { logger } = require("../logger");
var { prompt, promptOnce } = require("../prompt");
var { requireAuth } = require("../requireAuth");
var utils = require("../utils");
const { getAllAccounts } = require("../auth");

var TEMPLATE_ROOT = path.resolve(__dirname, "../../templates/");
var BANNER_TEXT = fs.readFileSync(path.join(TEMPLATE_ROOT, "banner.txt"), "utf8");
var GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");

var _isOutside = function (from, to) {
  return path.relative(from, to).match(/^\.\./);
};

const choices = [
  {
    value: "database",
    name: "Realtime Database: Configure a security rules file for Realtime Database and (optionally) provision default instance",
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
    value: "hosting",
    name: "Hosting: Configure files for Firebase Hosting and (optionally) set up GitHub Action deploys",
    checked: false,
  },
  {
    value: "hosting:github",
    name: "Hosting: Set up GitHub Action deploys",
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
];
const featureNames = choices.map((choice) => choice.value);

const DESCRIPTION = `Interactively configure the current directory as a Firebase project or initialize new features in an already configured Firebase project directory.

This command will create or update 'firebase.json' and '.firebaserc' configuration files in the current directory. 

To initialize a specific Firebase feature, run 'firebase init [feature]'. Valid features are:
${[...featureNames]
  .sort()
  .map((n) => `\n  - ${n}`)
  .join("")}`;

module.exports = new Command("init [feature]")
  .description(DESCRIPTION)
  .before(requireAuth)
  .action(function (feature, options) {
    if (feature && !featureNames.includes(feature)) {
      return utils.reject(
        clc.bold(feature) +
          " is not a supported feature; must be one of " +
          featureNames.join(", ") +
          ".",
        { exit: 1 }
      );
    }

    var cwd = options.cwd || process.cwd();

    var warnings = [];
    var warningText = "";
    if (_isOutside(homeDir, cwd)) {
      warnings.push("You are currently outside your home directory");
    }
    if (cwd === homeDir) {
      warnings.push("You are initializing your home directory as a Firebase project directory");
    }

    var existingConfig = Config.load(options, true);
    if (existingConfig) {
      warnings.push("You are initializing within an existing Firebase project directory");
    }

    var config =
      existingConfig !== null ? existingConfig : new Config({}, { projectDir: cwd, cwd: cwd });

    if (warnings.length) {
      warningText =
        "\nBefore we get started, keep in mind:\n\n  " +
        clc.yellow.bold("* ") +
        warnings.join("\n  " + clc.yellow.bold("* ")) +
        "\n";
    }

    logger.info(
      clc.yellow.bold(BANNER_TEXT) +
        "\nYou're about to initialize a Firebase project in this directory:\n\n  " +
        clc.bold(config.projectDir) +
        "\n" +
        warningText
    );

    var setup = {
      config: config.src,
      rcfile: config.readProjectFile(".firebaserc", {
        json: true,
        fallback: {},
      }),
    };

    var next;
    // HACK: Windows Node has issues with selectables as the first prompt, so we
    // add an extra confirmation prompt that fixes the problem
    if (process.platform === "win32") {
      next = promptOnce({
        type: "confirm",
        message: "Are you ready to proceed?",
      });
    } else {
      next = Promise.resolve(true);
    }

    return next
      .then(function (proceed) {
        if (!proceed) {
          return utils.reject("Aborted by user.", { exit: 1 });
        }

        if (feature) {
          setup.featureArg = true;
          setup.features = [feature];
          return undefined;
        }
        return prompt(setup, [
          {
            type: "checkbox",
            name: "features",
            message:
              "Which Firebase features do you want to set up for this directory? " +
              "Press Space to select features, then Enter to confirm your choices.",
            choices: choices,
          },
        ]);
      })
      .then(function () {
        if (setup.features.length === 0) {
          return utils.reject(
            "Must select at least one feature. Use " +
              clc.bold.underline("SPACEBAR") +
              " to select features, or specify a feature by running " +
              clc.bold("firebase init [feature_name]")
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
          setup.features = setup.features.filter((f) => f != "hosting:github");
        }

        return init(setup, config, options);
      })
      .then(function () {
        logger.info();
        utils.logBullet("Writing configuration info to " + clc.bold("firebase.json") + "...");
        config.writeProjectFile("firebase.json", setup.config);
        utils.logBullet("Writing project information to " + clc.bold(".firebaserc") + "...");
        config.writeProjectFile(".firebaserc", setup.rcfile);
        if (!fsutils.fileExistsSync(config.path(".gitignore"))) {
          utils.logBullet("Writing gitignore file to " + clc.bold(".gitignore") + "...");
          config.writeProjectFile(".gitignore", GITIGNORE_TEMPLATE);
        }
        logger.info();
        utils.logSuccess("Firebase initialization complete!");
      });
  });
