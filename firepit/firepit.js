// Copyright 2018, Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const fs = require("fs");
const path = require("path");
const { fork, spawn } = require("child_process");
const homePath = require("user-home");
const chalk = require("chalk");
const shell = require("shelljs");
shell.config.silent = true;

const runtime = require("./runtime");
const version = require("./package.json").version;

let config;
try {
  config = require("./config");
} catch (err) {
  console.warn("Invalid Firepit configuration, this may be a broken build.");
  process.exit(2);
}

function SetWindowTitle(title) {
  if (process.platform === "win32") {
    process.title = title;
  } else {
    process.stdout.write("\x1b]2;" + title + "\x1b\x5c");
  }
}

const isWindows = process.platform === "win32";
const installPath = path.join(homePath, ".cache", "firebase", "tools");
let runtimeBinsPath = path.join(homePath, ".cache", "firebase", "runtime");

const npmArgs = [
  `--script-shell=${runtimeBinsPath}/shell${isWindows ? ".bat" : ""}`,
  `--globalconfig=${path.join(runtimeBinsPath, "npmrc")}`,
  `--userconfig=${path.join(runtimeBinsPath, "npmrc")}`,
  `--scripts-prepend-node-path=auto`
];

let safeNodePath;
const unsafeNodePath = process.argv[0];

const flagDefinitions = [
  "file-debug",
  "log-debug",
  "disable-write",
  "runtime-check",
  "setup-check",
  "force-setup",
  "force-update",
  "ignore-embedded-cache"
];

const flags = flagDefinitions.reduce((flags, name) => {
  flags[name] = process.argv.indexOf(`--tool:${name}`) !== -1;
  if (flags[name]) {
    process.argv.splice(process.argv.indexOf(`--tool:${name}`), 1);
  }

  return flags;
}, {});

if (flags["runtime-check"]) {
  console.log(`firepit invoked for runtime check, exiting subpit.`);
  return;
}

debug(`Welcome to firepit v${version}!`);

(async () => {
  const isTopLevel = !process.env.FIREPIT_VERSION;
  safeNodePath = await getSafeCrossPlatformPath(isWindows, process.argv[0]);
  uninstallLegacyFirepit();

  if (flags["setup-check"]) {
    const bins = FindTool("firebase-tools/lib/bin/firebase");

    for (const bin of bins) {
      bins[bin] = await getSafeCrossPlatformPath(bins[bin]);
    }

    console.log(JSON.stringify({ bins }));
    return;
  }

  if (flags["force-update"]) {
    console.log(`Please wait while we clear npm's cache...`);
    process.argv = [
      ...process.argv.slice(0, 2),
      "is:npm",
      "cache",
      "clean",
      "--force"
    ];
    const code = await ImitateNPM();

    if (code) {
      console.log("NPM cache clearing failed, can't update.");
      process.exit(code);
    }

    flags["ignore-embedded-cache"] = true;
    flags["force-setup"] = true;
    console.log(`Trashing old lib/ folder...`);
    shell.rm("-rf", installPath);
  }

  await createRuntimeBinaries();
  if (flags["force-setup"]) {
    debug("Forcing setup...");
    await SetupFirebaseTools();
    console.log("firebase-tools setup complete.");
    return;
  }

  if (isTopLevel && !config.headless) {
    /*
      If firepit is set to be headful then open a shell if needed and spawn the welcome screen
    */
    const welcome_path = await getSafeCrossPlatformPath(
      isWindows,
      path.join(__dirname, "/welcome.js")
    );

    const firebaseToolsCommand = await getFirebaseToolsCommand();
    appendToPath(isWindows, [path.join(installPath, "bin"), runtimeBinsPath]);
    const shellEnv = {
      FIREPIT_VERSION: version,
      ...process.env
    };

    if (isWindows) {
      const shellConfig = {
        stdio: "inherit",
        env: shellEnv
      };

      spawn(
        "cmd",
        [
          "/k",
          [
            `doskey firebase=${firebaseToolsCommand} $*`,
            `doskey npm=${firebaseToolsCommand} is:npm $*`,
            `set prompt=${chalk.yellow("$G")}`,
            `${firebaseToolsCommand} is:node ${welcome_path} ${firebaseToolsCommand}`
          ].join(" & ")
        ],
        shellConfig
      );

      process.on("SIGINT", () => {
        debug("Received SIGINT. Refusing to close top-level shell.");
      });
    } else {
      process.argv = [
        ...process.argv.slice(0, 2),
        "is:node",
        welcome_path,
        firebaseToolsCommand
      ];
      const code = await ImitateNode();

      if (code) {
        console.log("Node failed to run welcome script.");
        process.exit(code);
      }

      spawn("bash", {
        env: { ...shellEnv, PS1: "\\e[0;33m> \\e[m" },
        stdio: "inherit"
      });
    }
  } else {
    /*
      If firepit is set to be headless, then just fall through to the normal flow.
    */
    SetWindowTitle("Firebase CLI");
    await firepit();
  }

  if (flags["file-debug"]) {
    fs.writeFileSync("firepit-log.txt", debug.log.join("\n"));
  }
})().catch(err => {
  debug(err.toString());
  console.log(
    `This tool has encountered an error. Please file a bug on Github and include firepit-log.txt`
  );
  fs.writeFileSync("firepit-log.txt", debug.log.join("\n"));
});

function uninstallLegacyFirepit() {
  const isLegacyFirepit = !shell.ls(
    path.join(homePath, ".cache", "firebase", "cli")
  ).code;

  let installedFirebaseToolsPackage = {};
  const installedFirebaseToolsPackagePath = path.join(
    homePath,
    ".cache/firebase/tools/lib/node_modules/firebase-tools/package.json"
  );
  const firepitFirebaseToolsPackagePath = path.join(
    __dirname,
    "vendor/node_modules/firebase-tools/package.json"
  );
  const firepitFirebaseToolsPackage = JSON.parse(
    shell.cat(firepitFirebaseToolsPackagePath)
  );
  try {
    installedFirebaseToolsPackage = JSON.parse(
      shell.cat(installedFirebaseToolsPackagePath)
    );
  } catch (err) {
    debug("No existing firebase-tools install found.");
  }

  debug(
    `Installed ft@${installedFirebaseToolsPackage.version ||
      "none"} and packaged ft@${firepitFirebaseToolsPackage.version}`
  );

  const isLegacyFirebaseTools =
    installedFirebaseToolsPackage.version !==
    firepitFirebaseToolsPackage.version;

  if (!isLegacyFirepit && !isLegacyFirebaseTools) return;
  debug("Legacy firepit / firebase-tools detected, clearing it out...");
  debug(shell.rm("-rf", path.join(homePath, ".cache", "firebase")));
}

async function getFirebaseToolsCommand() {
  const isRuntime = await VerifyNodePath(safeNodePath);
  debug(`Node path ${safeNodePath} is runtime? ${isRuntime}`);

  let firebase_command;
  if (isRuntime) {
    const script_path = await getSafeCrossPlatformPath(
      isWindows,
      path.join(__dirname, "/firepit.js")
    );
    firebase_command = `${safeNodePath} ${script_path}`; // We should store this as an array to prevent issues with spaces
  } else {
    firebase_command = safeNodePath;
  }
  debug(firebase_command);
  return firebase_command;
}

async function VerifyNodePath(nodePath) {
  const runtimeCheckPath = await getSafeCrossPlatformPath(
    isWindows,
    path.join(__dirname, "check.js")
  );
  return new Promise(resolve => {
    const cmd = spawn(nodePath, [runtimeCheckPath, "--tool:runtime-check"], {
      shell: true
    });

    let result = "";
    cmd.on("error", error => {
      throw error;
    });

    cmd.stderr.on("data", stderr => {
      debug(`STDERR: ${stderr.toString()}`);
    });

    cmd.stdout.on("data", stdout => {
      debug(`STDOUT: ${stdout.toString()}`);
      result += stdout.toString();
    });

    cmd.on("close", code => {
      debug(
        `[VerifyNodePath] Expected "✓" from runtime got code ${code} with output "${result}"`
      );
      if (code === 0) {
        if (result.indexOf("✓") >= 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
  });
}

function FindTool(bin) {
  /*
    When locating firebase-tools, npm, node, etc they could all be hiding
    inside the firepit exe or in the npm cache.
   */

  const potentialPaths = [
    path.join(installPath, "lib/node_modules", bin),
    path.join(installPath, "node_modules", bin),
    path.join(__dirname, "node_modules", bin)
  ];

  return potentialPaths
    .map(path => {
      debug(`Checking for ${bin} install at ${path}`);
      if (shell.ls(path + ".js").code === 0) {
        debug(`Found ${bin} install.`);
        return path;
      }
    })
    .filter(p => p);
}
async function firepit() {
  runtimeBinsPath = await getSafeCrossPlatformPath(isWindows, runtimeBinsPath);
  process.argv[0] = safeNodePath;
  process.env.NODE = safeNodePath;
  process.env._ = safeNodePath;

  debug(safeNodePath);
  debug(process.argv);

  await createRuntimeBinaries();
  appendToPath(isWindows, [runtimeBinsPath]);

  if (process.argv.indexOf("is:npm") !== -1) {
    const code = await ImitateNPM();
    if (code) {
      process.exit(code);
    }
  }

  if (process.argv.indexOf("is:node") !== -1) {
    const code = await ImitateNode();
    if (code) {
      process.exit(code);
    }
  }

  let firebaseBins = FindTool("firebase-tools/lib/bin/firebase");
  if (!firebaseBins.length) {
    debug(`CLI not found! Invoking setup...`);
    await SetupFirebaseTools();
    firebaseBins = FindTool("firebase-tools/lib/bin/firebase");
  }

  const firebaseBin = firebaseBins[0];
  debug(`CLI install found at "${firebaseBin}", starting fork...`);
  const code = await ImitateFirebaseTools(firebaseBin);
  process.exit(code);
}

function ImitateNPM() {
  debug("Detected is:npm flag, calling NPM");
  const breakerIndex = process.argv.indexOf("is:npm") + 1;
  const args = [...npmArgs, ...process.argv.slice(breakerIndex)];
  debug(args.join(" "));
  return new Promise(resolve => {
    const cmd = fork(FindTool("npm/bin/npm-cli")[0], args, {
      stdio: "inherit",
      env: process.env
    });
    cmd.on("close", code => {
      debug(`faux-npm done.`);
      resolve(code);
    });
  });
}

function ImitateNode() {
  debug("Detected is:node flag, calling node");
  const breakerIndex = process.argv.indexOf("is:node") + 1;
  const nodeArgs = [...process.argv.slice(breakerIndex)];
  return new Promise(resolve => {
    const cmd = fork(nodeArgs[0], nodeArgs.slice(1), {
      stdio: "inherit",
      env: process.env
    });
    cmd.on("close", code => {
      debug(`faux-node done.`);
      resolve(code);
    });
  });
}

async function SetupFirebaseTools() {
  debug(`Attempting to install to "${installPath}"`);

  const original_argv = [...process.argv];
  const nodeModulesPath = path.join(installPath, "lib");
  const binPath = path.join(installPath, "bin");
  debug(shell.mkdir("-p", nodeModulesPath).toString());
  debug(shell.mkdir("-p", binPath).toString());

  if (flags["ignore-embedded-cache"]) {
    debug("Using remote for slow install...");
    // Install remotely
    process.argv = [
      ...process.argv.slice(0, 2),
      "is:npm",
      "install",
      "-g",
      "npm",
      config.firebase_tools_package
    ];
    const code = await ImitateNPM();
    if (code) {
      console.log("Setup from remote host failed due to npm error.");
      process.exit(code);
    }
  } else {
    debug("Using embedded cache for quick install...");
    debug(
      shell
        .cp("-R", path.join(__dirname, "vendor/*"), nodeModulesPath)
        .toString()
    );
  }

  debug(
    shell
      .ln(
        "-sf",
        path.join(
          nodeModulesPath,
          "node_modules/firebase-tools/lib/bin/firebase.js"
        ),
        path.join(binPath, "firebase")
      )
      .toString()
  );

  if (!FindTool("firebase-tools/lib/bin/firebase").length) {
    console.warn(`firebase-tools setup failed.`);
    process.exit(2);
  }

  process.argv = original_argv;
}

function ImitateFirebaseTools(binPath) {
  debug("Detected no special flags, calling firebase-tools");
  return new Promise(resolve => {
    const cmd = fork(binPath, process.argv.slice(2), {
      stdio: "inherit",
      env: { ...process.env, FIREPIT_VERSION: version }
    });
    cmd.on("close", code => {
      debug(`firebase-tools is done.`);
      resolve(code);
    });
  });
}

async function createRuntimeBinaries() {
  const runtimeBins = {
    /* Linux / OSX */
    shell: `"${unsafeNodePath}"  ${runtimeBinsPath}/shell.js "$@"`,
    node: `"${unsafeNodePath}"  ${runtimeBinsPath}/node.js "$@"`,
    npm: `"${unsafeNodePath}" "${
      FindTool("npm/bin/npm-cli")[0]
    }" ${npmArgs.join(" ")} "$@"`,

    /* Windows */
    "node.bat": `@echo off
"${unsafeNodePath}"  ${runtimeBinsPath}\\node.js %*`,
    "shell.bat": `@echo off
"${unsafeNodePath}"  ${runtimeBinsPath}\\shell.js %*`,
    "npm.bat": `@echo off
node "${FindTool("npm/bin/npm-cli")[0]}" ${npmArgs.join(" ")}  %*`,

    /* Runtime scripts */
    "shell.js": `${appendToPath.toString()}\n${getSafeCrossPlatformPath.toString()}\n(${runtime.Script_ShellJS.toString()})()`,
    "node.js": `(${runtime.Script_NodeJS.toString()})()`,

    /* Config files */
    npmrc: `prefix = ${installPath}`
  };

  try {
    shell.mkdir("-p", runtimeBinsPath);
  } catch (err) {
    debug(err);
  }

  if (!flags["disable-write"]) {
    Object.keys(runtimeBins).forEach(filename => {
      const runtimeBinPath = path.join(runtimeBinsPath, filename);
      try {
        fs.unlinkSync(runtimeBinPath);
      } catch (err) {
        debug(err);
      }
      fs.writeFileSync(runtimeBinPath, runtimeBins[filename]);
      shell.chmod("+x", runtimeBinPath);
    });
  }
  debug("Runtime binaries created.");
}

/*
-------------------------------------
Shared Firepit / Runtime Functions

Are invoked in both Firepit and in the Runtime scripts.
-------------------------------------
 */

async function getSafeCrossPlatformPath(isWin, path) {
  if (!isWin) return path;

  let command = `for %I in ("${path}") do echo %~sI`;
  return new Promise(resolve => {
    const cmd = require("child_process").spawn(`cmd`, ["/c", command], {
      shell: true
    });

    let result = "";
    cmd.on("error", error => {
      throw error;
    });
    cmd.stdout.on("data", stdout => {
      result += stdout.toString();
    });

    cmd.on("close", code => {
      if (code === 0) {
        const lines = result.split("\r\n").filter(line => line);
        const path = lines.slice(-1)[0];
        resolve(path.trim());
      } else {
        throw `Attempt to dosify path failed with code ${code}`;
      }
    });
  });
}

function appendToPath(isWin, pathsToAppend) {
  const PATH = process.env.PATH;
  const pathSeperator = isWin ? ";" : ":";

  process.env.PATH = [
    ...pathsToAppend,
    ...PATH.split(pathSeperator).filter(folder => folder)
  ].join(pathSeperator);
}

function debug(...msg) {
  if (!debug.log) debug.log = [];

  if (flags["log-debug"]) {
    msg.forEach(m => console.log(m));
  } else {
    msg.forEach(m => debug.log.push(m));
  }
}
