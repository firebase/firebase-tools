/*
  -------------------------------------
  Introduction
  -------------------------------------

     "This is probably the scariest 1000 lines of code I have ever seen" - Sam Stern

  Welcome to Firepit! This script (and it's siblings) is a bundle of magical
  code which allow the firebase-tools package to run on a developer's machine without
  a dependency on Node.js as a single, standalone binary.

  If firebase-tools was a simpler tool, Firepit would also be simpler, however... it's
  not. The "firebase" command relies on a few patterns which make bundling it without
  Node.js particularly difficult, specifically it enjoys shelling out to npm / node.
  Most of the work in this package is to properly ensure that those commands (npm, node)
  exist and function as expected even when deep in multiple layers of shelling.

  Some examples of how shelling is used...

  1) Running any "firebase" command will automatically call npm to check is the "firebase-tools"
     package itself is outdated.

  2) Running "firebase deploy --only functions" uses npm to build and prepare the developer's
     Cloud Functions code.

  3) Developer's Cloud Functions may require being built with Typescript or other tools which require
     access to Node / npm

  The majority of firebase-tools commands work perfectly with minimal effort from Firepit,
  specifically any JavaScript-only commands (which are most) work totally fine. Most of the
  complexity is related to building and deploying Cloud Functions.

  Firepit's job isn't *just* to ensure all commands work, it also simplifies the getting
  started flows for developers by offering a "hand-holding" setup (see welcome.js) and
  improving what we call the "double-click" experience (when a developer downloads the file and
  clicks it to run).

  Beyond that Firepit also puts extra effort into ensuring that *any* "firebase" related command
  will still function if copy/pasted from existing tutorials. Specifically, if the internet says
  running "npm update -g firebase-tools" will update your CLI, then the internet must be right and
  we need to support that.

  This code is generally very carefully written with special care given to cross platform compatibility.
  We avoid many cross-platform problems by getting *back* into Node as soon as possible. We'll talk
  more about this below, but most code which helps Firepit work cross-platform is not platform-specific
  code, but in fact uses Node's natural cross-platform tools / libraries to help out as much as possible.
  We'll discuss this more in detail below.

  Ready? Let's go!
 */

/*
  -------------------------------------
  Globals
  -------------------------------------
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { fork, spawn, spawnSync } = require("child_process");
const chalk = require("chalk");
const version = require("./package.json").version;

const homePath = os.homedir();

/*
  Inline shell polyfill to replace external shelljs dependency.
  Implements Unix-style commands (mkdir, rm, cp, chmod, ln, ls, cat, exec)
  using native Node fs and child_process APIs.
 */
const shell = {
  config: { silent: true },
  mkdir: (flag, dirPath) => {
    const target = dirPath || flag;
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch (e) {}
    return "";
  },
  rm: (flag, targetPath) => {
    const target = targetPath || flag;
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (e) {}
    return "";
  },
  cp: (flag, src, dest) => {
    const actualSrc = dest ? src : flag;
    const actualDest = dest ? dest : src;
    try {
      if (typeof actualSrc === "string" && actualSrc.endsWith("/*")) {
        const baseSrc = actualSrc.slice(0, -2);
        if (fs.existsSync(baseSrc)) {
          fs.cpSync(baseSrc, actualDest, { recursive: true });
        }
      } else {
        fs.cpSync(actualSrc, actualDest, { recursive: true });
      }
    } catch (e) {}
    return "";
  },
  chmod: (mode, targetPath) => {
    try {
      fs.chmodSync(targetPath, mode === "+x" ? 0o755 : mode);
    } catch (e) {}
    return "";
  },
  ln: (flag, src, dest) => {
    const actualSrc = dest ? src : flag;
    const actualDest = dest ? dest : src;
    try {
      try {
        fs.unlinkSync(actualDest);
      } catch (e) {}
      fs.symlinkSync(actualSrc, actualDest);
    } catch (e) {
      try {
        fs.copyFileSync(actualSrc, actualDest);
      } catch (e) {}
    }
    return "";
  },
  ls: targetPath => {
    try {
      if (!fs.existsSync(targetPath)) return Object.assign([], { code: 1 });
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) return Object.assign([targetPath], { code: 0 });
      const files = fs.readdirSync(targetPath);
      return Object.assign(files, { code: 0 });
    } catch (e) {
      return Object.assign([], { code: 1 });
    }
  },
  cat: filePath => {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (e) {
      return "";
    }
  },
  exec: cmd => {
    try {
      const result = spawnSync(cmd, {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8"
      });
      return {
        code: result.status !== null ? result.status : 1,
        stdout: result.stdout || "",
        stderr: result.stderr || ""
      };
    } catch (e) {
      return {
        code: e.status || 1,
        stdout: e.stdout || "",
        stderr: e.stderr || ""
      };
    }
  }
};

/*
  Node Single Executable Application (SEA) support.
 */
let sea;
try {
  sea = require("node:sea");
} catch (e) {}
const isSeaMode = typeof sea === "object" && typeof sea.isSea === "function" && sea.isSea();

function extractSEAAsset(assetName, targetPath) {
  if (isSeaMode) {
    try {
      const assetData = sea.getRawAsset ? sea.getRawAsset(assetName) : sea.getAsset(assetName);
      const assetBuf = Buffer.isBuffer(assetData) ? assetData : Buffer.from(assetData);
      fs.writeFileSync(targetPath, assetBuf);
      debug(`Extracted asset ${assetName} to ${targetPath}`);
    } catch (err) {
      debug(`Failed to extract asset ${assetName}: ${err}`);
      throw err;
    }
  }
}

const runtime = require("./runtime");

/*
  We use a configuration file (see config.template.js) which is generated by our build pipeline to
  determine if we're running in headless or headful mode.
 */
let config = { headless: true };
try {
  config = Object.assign({ headless: true }, require("./config"));
} catch (err) {
  // config file may not be present in local dev
}

const isWindows = process.platform === "win32";

/*
  The installPath is where we'll place our extracted firebase-tools scripts.
  The runtimeBinsPath is where we place our "npm" and "node" shell scripts which route back into
  Firepit.
 */
const installPath = path.join(homePath, ".cache", "firebase", "tools");
let runtimeBinsPath = path.join(homePath, ".cache", "firebase", "runtime");

/*
  Base npmArgs used whenever we pretend to be npm.
 */
const npmArgs = [
  `--script-shell=${runtimeBinsPath}/shell${isWindows ? ".bat" : ""}`,
  `--globalconfig=${path.join(runtimeBinsPath, "npmrc")}`,
  `--scripts-prepend-node-path=auto`
];

let safeNodePath;
const unsafeNodePath = process.argv[0];

/*
  Firepit flags
 */
const flagDefinitions = [
  "file-debug", // --tool:file-debug - Write log to a file
  "log-debug", // --tool:log-debug - Write log to stdout
  "disable-write", // --tool:disable-write - Do not write runtime scripts to filesystem
  "runtime-check", // --tool:runtime-check - Determine if firepit binary is node or not
  "setup-check", // --tool:setup-check - Check if firebase-tools is set up
  "force-setup", // --tool:force-setup - Force Firepit to go through setup
  "force-update", // --tool:force-update - Aggressively clear npm cache and re-setup
  "ignore-embedded-cache" // --tool:ignore-embedded-cache - Setup from online, do not use embedded firebase-tools
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

const APPEND_TO_PATH_SRV = `function appendToPath(isWin, pathsToAppend) {
  const PATH = process.env.PATH;
  const pathSeperator = isWin ? ";" : ":"
  process.env.PATH = [
    ...pathsToAppend,
    ...PATH.split(pathSeperator).filter(folder => folder)
  ].join(pathSeperator);
}`;

const GET_SAFE_PATH_SRV = `async function getSafeCrossPlatformPath(isWin, path) {
  if (!isWin) return path;
  let command = \`for %I in ("\${path}") do echo %~sI\`;
  return new Promise(resolve => {
    const cmd = require("child_process").spawn(\`cmd\`, ["/c", command], {
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
        const lines = result.split("\\r\\n").filter(line => line);
        const path = lines.slice(-1)[0];
        resolve(path.trim());
      } else {
        throw \`Attempt to dosify path failed with code \${code}\`;
      }
    });
  });
}`;

debug(`Welcome to firepit v${version}!`);

/*
  -------------------------------------
  The Main Path
  -------------------------------------
*/
(async () => {
  /*
    In Node Single Executable Application (SEA) mode, any child process forked from Firepit
    (such as child_process.fork(script) or firebase is:node script.js) will invoke the SEA
    executable as the Node runtime. We intercept child script invocations at the entrypoint
    and execute the requested script directly via createRequire to prevent recursive execution
    of the main Firepit router.
   */
  if (isSeaMode) {
    const moduleProto = require("module");
    if (moduleProto.Module && typeof moduleProto.Module._nodeModulePaths === "function") {
      moduleProto.Module._nodeModulePaths(installPath).forEach(p => {
        if (!module.paths.includes(p)) {
          module.paths.push(p);
        }
      });
    }

    function isJsScript(filePath) {
      if (!filePath) return false;
      try {
        const resolved = path.resolve(filePath);
        if (resolved === path.resolve(process.execPath)) return false;
        if (!fs.existsSync(resolved)) return false;
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) return false;

        const ext = path.extname(resolved).toLowerCase();
        const base = path.basename(resolved).toLowerCase();
        if (base === "firebase" || base === "firebase.exe") return false;
        if ([".js", ".cjs", ".mjs"].includes(ext)) return true;

        // Check for binary headers (ELF, Mach-O, Windows PE)
        const fd = fs.openSync(resolved, "r");
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);

        if (buf[0] === 0x7f && buf.toString("ascii", 1, 4) === "ELF") return false;
        if (buf.toString("ascii", 0, 2) === "MZ") return false;
        const magic32 = buf.readUInt32BE(0);
        if (
          magic32 === 0xfeedface ||
          magic32 === 0xfeedfacf ||
          magic32 === 0xcafebabe ||
          magic32 === 0xcefaedfe ||
          magic32 === 0xcffaedfe
        ) {
          return false;
        }
        return true;
      } catch (err) {
        return false;
      }
    }

    let resolvedScriptPath;
    let spliceIndex;
    const { createRequire } = require("module");
    const fsRequire = createRequire(process.execPath);

    if (process.argv[1] && isJsScript(process.argv[1])) {
      try {
        resolvedScriptPath = fsRequire.resolve(path.resolve(process.argv[1]));
        spliceIndex = 1;
      } catch (err) {}
    }
    if (!resolvedScriptPath && process.argv[2] && isJsScript(process.argv[2])) {
      try {
        resolvedScriptPath = fsRequire.resolve(path.resolve(process.argv[2]));
        spliceIndex = 2;
      } catch (err) {}
    }

    if (resolvedScriptPath) {
      process.argv[0] = process.execPath;
      if (spliceIndex === 2) {
        process.argv.splice(1, 1);
      }
      try {
        const scriptRequire = createRequire(resolvedScriptPath);
        scriptRequire(resolvedScriptPath);
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
      return;
    }
  }

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

    process.argv = [...process.argv.slice(0, 2), "is:npm", "cache", "clean", "--force"];

    const code = await ImitateNPM();

    if (code) {
      console.log("NPM cache clearing failed, can't update.");
      process.exit(code);
    }

    flags["ignore-embedded-cache"] = true;
    flags["force-setup"] = true;
    console.log(`Clearing out your firebase-tools setup...`);

    try {
      fs.rmSync(installPath, { recursive: true, force: true });
    } catch (e) {}
  }

  await createRuntimeBinaries();

  if (flags["force-setup"]) {
    debug("Forcing setup...");
    await SetupFirebaseTools();
    console.log("firebase-tools setup complete.");
    return;
  }

  if (isTopLevel && !config.headless) {
    const welcome_path = await getSafeCrossPlatformPath(
      isWindows,
      path.join(isSeaMode ? runtimeBinsPath : __dirname, "welcome.js")
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
      process.argv = [...process.argv.slice(0, 2), "is:node", welcome_path, firebaseToolsCommand];
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
    SetWindowTitle("Firebase CLI");
    await firepit();
  }

  if (flags["file-debug"]) {
    fs.writeFileSync("firepit-log.txt", debug.log.join("\n"));
  }
})().catch(err => {
  debug(err.toString());
  console.log(
    `This tool has encountered an error. Please file a bug on Github (https://github.com/firebase/firebase-tools/) and include firepit-log.txt`
  );
  fs.writeFileSync("firepit-log.txt", debug.log.join("\n"));
});

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
    process.exit(code);
  }

  if (process.argv.indexOf("is:node") !== -1) {
    const code = await ImitateNode();
    process.exit(code);
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

/*
  -------------------------------------
  Imitate*()
  -------------------------------------
 */

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

  if (nodeArgs.length === 0) {
    console.log("Welcome to Node.js " + process.version);
    return Promise.resolve(0);
  }

  if (nodeArgs[0] === "-v" || nodeArgs[0] === "--version") {
    console.log(process.version);
    return Promise.resolve(0);
  }

  if (nodeArgs[0] === "-e" || nodeArgs[0] === "--eval") {
    const code = nodeArgs[1] || "";
    try {
      const vm = require("vm");
      const { createRequire } = require("module");
      const contextRequire = createRequire(process.cwd() + "/index.js");
      const sandbox = {
        require: contextRequire,
        process,
        console,
        Buffer,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
        global
      };
      sandbox.global = sandbox;
      const context = vm.createContext(sandbox);
      vm.runInContext(code, context);
      return Promise.resolve(0);
    } catch (e) {
      console.error(e);
      return Promise.resolve(1);
    }
  }

  if (nodeArgs[0] === "-p" || nodeArgs[0] === "--print") {
    const code = nodeArgs[1] || "";
    try {
      const vm = require("vm");
      const { createRequire } = require("module");
      const contextRequire = createRequire(process.cwd() + "/index.js");
      const sandbox = {
        require: contextRequire,
        process,
        console,
        Buffer,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
        global
      };
      sandbox.global = sandbox;
      const context = vm.createContext(sandbox);
      console.log(vm.runInContext(code, context));
      return Promise.resolve(0);
    } catch (e) {
      console.error(e);
      return Promise.resolve(1);
    }
  }

  return new Promise(resolve => {
    let target = path.resolve(nodeArgs[0]);
    if (!fs.existsSync(target) && fs.existsSync(target + ".js")) {
      target = target + ".js";
    }
    const cmd = fork(target, nodeArgs.slice(1), {
      stdio: "inherit",
      env: process.env
    });
    cmd.on("close", code => {
      debug(`faux-node done.`);
      resolve(code);
    });
    cmd.on("error", err => {
      console.error(err);
      resolve(1);
    });
  });
}

function ImitateFirebaseTools(binPath) {
  debug("Detected no special flags, calling firebase-tools");
  const targetScript = binPath.endsWith(".js") ? binPath : binPath + ".js";
  return new Promise(resolve => {
    const cmd = fork(targetScript, process.argv.slice(2), {
      stdio: "inherit",
      env: { ...process.env, FIREPIT_VERSION: version }
    });
    cmd.on("close", code => {
      debug(`firebase-tools is done.`);
      resolve(code);
    });
  });
}

/*
  -------------------------------------
  Core Functions
  -------------------------------------
 */

async function createRuntimeBinaries() {
  const safeNodePath = await getSafeCrossPlatformPath(isWindows, process.argv[0]);
  const unsafeNodePath = process.argv[0];
  const isRuntime = await VerifyNodePath(safeNodePath);

  const npmArgs = [
    `--scripts-prepend-node-path=auto`,
    `--script-shell=${path.join(runtimeBinsPath, "shell")}${isWindows ? ".bat" : ""}`,
    `--globalconfig=${path.join(runtimeBinsPath, "npmrc")}`
  ];

  const npmCliPath =
    FindTool("npm/bin/npm-cli")[0] ||
    path.join(installPath, "lib/node_modules/npm/bin/npm-cli.js");

  const runtimeBins = {
    /* Linux / OSX */
    firebase: `#!/bin/sh\nexec "${safeNodePath}" "$@"`,
    node: `#!/bin/sh\nexec "${safeNodePath}" is:node "$@"`,
    npm: `#!/bin/sh\nexec "${safeNodePath}" "${npmCliPath}" ${npmArgs.join(" ")} "$@"`,
    shell: `#!/bin/sh\nPATH="${runtimeBinsPath}:${installPath}/lib/node_modules/.bin:\$PWD/node_modules/.bin:\$PATH"\nexport PATH\nexec /bin/sh "$@"`,

    /* Windows */
    "firebase.bat": `@echo off\n"${safeNodePath}" %*`,
    "node.bat": `@echo off\n"${safeNodePath}" is:node %*`,
    "npm.bat": `@echo off\n"${safeNodePath}" "${npmCliPath}" ${npmArgs.join(
      " "
    )} %*`,
    "shell.bat": `@echo off\nset "PATH=${runtimeBinsPath};${installPath}\\lib\\node_modules\\.bin;%CD%\\node_modules\\.bin;%PATH%"\nif "%~1"=="" goto interactive\ncmd.exe /d /s /c %*\nexit /b %ERRORLEVEL%\n:interactive\ncmd.exe /k`,

    /* Runtime scripts */
    "shell.js": `${APPEND_TO_PATH_SRV}\n${GET_SAFE_PATH_SRV}\n(${runtime.Script_ShellJS.toString()})()`,
    "node.js": `(${runtime.Script_NodeJS.toString()})()`,

    /* Config files */
    npmrc: `prefix=${installPath}`
  };

  try {
    fs.mkdirSync(runtimeBinsPath, { recursive: true });
  } catch (err) {
    debug(err);
  }

  if (isRuntime) {
    Object.keys(runtimeBins).forEach(filename => {
      const runtimeBinPath = path.join(runtimeBinsPath, filename);
      try {
        fs.rmSync(runtimeBinPath, { recursive: true, force: true });
      } catch (err) {
        debug(err);
      }
      fs.writeFileSync(runtimeBinPath, runtimeBins[filename]);
      fs.chmodSync(runtimeBinPath, 0o755);
    });

    if (isSeaMode) {
      extractSEAAsset("welcome.js", path.join(runtimeBinsPath, "welcome.js"));
      extractSEAAsset("check.js", path.join(runtimeBinsPath, "check.js"));
    }
  }
  debug("Runtime binaries created.");
}

async function SetupFirebaseTools() {
  debug(`Attempting to install to "${installPath}"`);

  const original_argv = [...process.argv];
  const nodeModulesPath = path.join(installPath, "lib");
  const binPath = path.join(installPath, "bin");
  fs.mkdirSync(nodeModulesPath, { recursive: true });
  fs.mkdirSync(binPath, { recursive: true });

  if (!flags["ignore-embedded-cache"]) {
    if (isSeaMode) {
      debug("Extracting embedded assets...");
      const tarballPath = path.join(installPath, "firepit-assets.tar.gz");
      extractSEAAsset("firepit-assets.tar.gz", tarballPath);

      try {
        debug(`Running tar command to extract: ${tarballPath}`);
        const result = shell.exec(`tar -xzf "${tarballPath}" -C "${installPath}"`);
        if (result.code !== 0) {
          console.error(`Failed to extract firepit assets: ${result.stderr || result.stdout}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to extract firepit assets: ${err.message}`);
        process.exit(1);
      }
      try {
        fs.unlinkSync(tarballPath);
      } catch (e) {}
      debug("Embedded assets extracted successfully.");
      await createRuntimeBinaries();
    } else {
      debug("Using embedded cache for quick install...");
      shell.cp("-R", path.join(__dirname, "vendor/*"), nodeModulesPath);
    }
  } else {
    debug("Using remote for slow install...");
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
  }

  debug(
    shell
      .ln(
        "-sf",
        path.join(nodeModulesPath, "node_modules/firebase-tools/lib/bin/firebase.js"),
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

/*
  -------------------------------------
  Other / Helper Functions
  -------------------------------------
 */

function uninstallLegacyFirepit() {
  const cliDir = path.join(homePath, ".cache", "firebase", "cli");
  const isLegacyFirepit = fs.existsSync(cliDir);

  const installedFirebaseToolsPackagePath = path.join(
    homePath,
    ".cache/firebase/tools/lib/node_modules/firebase-tools/package.json"
  );

  let firepitFirebaseToolsVersion = config.firebase_tools_version;
  if (!firepitFirebaseToolsVersion) {
    const firepitFirebaseToolsPackagePath = path.join(
      __dirname,
      "vendor/node_modules/firebase-tools/package.json"
    );
    try {
      firepitFirebaseToolsVersion = JSON.parse(
        fs.readFileSync(firepitFirebaseToolsPackagePath, "utf8")
      ).version;
    } catch (err) {
      debug("No packaged firebase-tools version found in local dev.");
    }
  }

  let installedFirebaseToolsPackage = {};
  try {
    installedFirebaseToolsPackage = JSON.parse(
      fs.readFileSync(installedFirebaseToolsPackagePath, "utf8")
    );
  } catch (err) {
    debug("No existing firebase-tools install found.");
  }

  debug(
    `Installed ft@${installedFirebaseToolsPackage.version ||
      "none"} and packaged ft@${firepitFirebaseToolsVersion}`
  );

  const isLegacyFirebaseTools =
    installedFirebaseToolsPackage.version &&
    firepitFirebaseToolsVersion &&
    installedFirebaseToolsPackage.version !== firepitFirebaseToolsVersion;

  if (!isLegacyFirepit && !isLegacyFirebaseTools) return;
  debug("Legacy firepit / firebase-tools detected, clearing it out...");
  try {
    fs.rmSync(path.join(homePath, ".cache", "firebase"), { recursive: true, force: true });
  } catch (err) {
    debug(err.message);
  }
}

async function getFirebaseToolsCommand() {
  const safeNodePath = await getSafeCrossPlatformPath(isWindows, process.argv[0]);
  const isRuntime = await VerifyNodePath(safeNodePath);
  debug(`Node path ${safeNodePath} is runtime? ${isRuntime}`);

  let firebase_command;
  if (isRuntime && !isSeaMode) {
    const script_path = await getSafeCrossPlatformPath(
      isWindows,
      path.join(__dirname, "/firepit.js")
    );
    firebase_command = `"${safeNodePath}" "${script_path}"`;
  } else {
    firebase_command = `"${safeNodePath}"`;
  }

  debug(`Using firebase command: ${firebase_command}`);
  return firebase_command;
}

async function VerifyNodePath(nodePath) {
  const basename = path.basename(nodePath);
  if (
    nodePath === process.execPath ||
    basename.includes("firepit") ||
    basename.includes("firebase-tools")
  ) {
    return isSeaMode;
  }
  const runtimeCheckPath = await getSafeCrossPlatformPath(
    isWindows,
    path.join(isSeaMode ? runtimeBinsPath : __dirname, "check.js")
  );
  return new Promise(resolve => {
    const cmd = spawn(nodePath, [runtimeCheckPath, "--tool:runtime-check"], {
      stdio: "ignore"
    });
    cmd.on("close", code => {
      resolve(code === 0);
    });
    cmd.on("error", () => {
      resolve(false);
    });
  });
}

function FindTool(bin) {
  const potentialPaths = [
    path.join(installPath, "lib/node_modules", bin),
    path.join(installPath, "lib/node_modules/firebase-tools/standalone/node_modules", bin),
    path.join(installPath, "node_modules", bin),
    path.join(installPath, "lib", bin),
    path.join(__dirname, "node_modules", bin)
  ];

  return potentialPaths
    .map(p => {
      debug(`Checking for ${bin} install at ${p}`);
      if (fs.existsSync(p)) return p;
      if (fs.existsSync(p + ".js")) return p + ".js";
    })
    .filter(Boolean);
}

function SetWindowTitle(title) {
  if (isWindows) {
    process.title = title;
  }
}

/*
  -------------------------------------
  Shared Functions
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

  process.env.PATH = [...pathsToAppend, ...PATH.split(pathSeperator).filter(folder => folder)].join(
    pathSeperator
  );
}

function debug(...msg) {
  if (!debug.log) debug.log = [];

  if (flags["log-debug"]) {
    msg.forEach(m => console.log(m));
  } else {
    msg.forEach(m => debug.log.push(m));
  }
}
