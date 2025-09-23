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

  Our dependencies are largely uninteresting, we use "user-home" to know where to install our scripts
  and files to, we use "chalk" for nice colors, and we use a handful of built in libraries for
  their intended purposes.

  The most interesting dep is "shelljs". This library is a collection of Unix-style commands like
  (cat, ls, mkdir, etc) which are reimplemented in cross-platform JavaScript. They function
  identically across platforms and help us whenever we're dealing with the filesystem. The names
  are universal and easy to understand for anyone with a *nix background.

  We also include our own package.json so we can report the Firepit version to Google Analytics.
 */

const fs = require("fs");
const path = require("path");
const { fork, spawn } = require("child_process");
const homePath = require("user-home");
const chalk = require("chalk");
const shell = require("shelljs");
shell.config.silent = true;
const version = require("./package.json").version;

/*
  Our only other require, the "./runtime.js" file, is worth discussing in detail. The script itself
  is documented in itself, so you're welcome to read that, however the more important topic is the
  general structure Firepit uses.

  Firepit loops back into itself constantly and is essentially a router which ensures that incoming
  invocations end up calling the correct scripts using the embedded Node runtime. A Firepit binary
  doesn't include *just* the "firebase" command, it also includes "npm" and "node" because these
  are needed by "firebase-tools" to be fully functional. When running in headful (double-click)
  mode these commands are exposed to the developer, they can run "npm" just like they would with
  a normal Node install, however internally it's not *really* npm, they're invoking a shell script
  which comes back into a new Firepit process and is then routed to the npm scripts.

  When you're not running Firepit in headful mode, these sub-commands can still be accessed via
  hidden flags...

    firebase is:npm install -g chalk // Calls npm
    firebase is:node ./script.js     // Calls node
    firebase --help                  // Calls firebase-tools

  These hidden flags aren't intended to be used by end-developers, they're needed because we're
  constantly hoping out of the Firepit process. For example Firepit spawn a shell, the shell calls
  "npm" (which is actually a new Firepit process) which calls the npm scripts which invokes a user's
  build script which spawns a node process (which is actually a new Firepit process) and so on.

  We use these special flags to give context between invocations and ask Firepit to imitate whatever
  tool the user wants to call. (See Imitate*() functions)

  In order to allow ensure that the "node", "npm", and "firebase" commands exist through all
  these processes we can do two things.

  1) We can modify env variables like PATH to place our scripts in place of actual tools
  2) We can pass special flags to the tools we're pretending to be so they tell their children
     that the world is how we want them to think it is.

  Technically (and on a high level) When a developer runs Firepit we go through a series of steps.

  1) If needed, extract the copy of "firebase-tools" which is embedded in the binary file
     (see SetupFirebaseTools())

  2) Generate a series of "runtime" scripts which get called from other processes. These scripts
     look to the developer like the "npm" or "node" commands, but actually route back into Firepit
     and are redirected to the embedded tools.
     (see createRuntimeBinaries())

  3) Determine how we can access our embedded NodeJS runtime
     (see VerifyNodePath())

  4) Modify the developers env variables to include the "runtime" scripts and other changes
     (see firepit())

  5) Route the invocation to the correct command (firebase, npm, or node).
  6) Exit with the correct code and go to bed.

  The "runtime.js" script contains two functions. In createRuntimeBinaries() we call .toString()
  on these functions and write them to files (which later act like commands on the user's path).

  The functions in "runtime.js" are not meant to be invoked from Firepit, but are standalone scripts
  which get ran *through* Firepit when it is imitating Node.js.
 */
const runtime = require("./runtime");


/*
  We use a configuration file (see config.template.js) which is generated by our build pipeline to
  determine if we're running in headless or headful mode.
 */
let config;
try {
  config = require("./config");
} catch (err) {
  console.warn("Invalid Firepit configuration, this may be a broken build.");
  process.exit(2);
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
  As I mentioned above, one of the ways we can control the detached children processes which get
  created when using Firepit is to pass special arguments when we're pretending to be them.

  In this case, when a user calls "npm" (and it routes to Firepit, pretending to be npm) we tack
  on a few scripts which change the global config file to point to our custom installPath and
  we supply a special "script shell".

  This "script shell" is normally something like "bash" or "cmd.exe", however in our case, we want
  to inject Firepit into there again to ensure everyone thinks the commands we're exposing still exist.

  You can see the implementation of this script in runtime.js/Script_ShellJS().

  When npm invokes a script on behalf of the developer (like when they run "npm run build") this
  command is then spawned in npm as "$SCRIPT_SHELL $USER_SCRIPT" so by replacing the this shell
  we can set up env variables / PATHs / etc then spawn the $USER_SCRIPT manually so the behavior
  looks no different.

  We use these base npmArgs every time we pretend to be npm. They can be overwritten by a user if
  they manually specify any of these flags and that would produce unexpected behavior.
 */
const npmArgs = [
  `--script-shell=${runtimeBinsPath}/shell${isWindows ? ".bat" : ""}`,
  `--globalconfig=${path.join(runtimeBinsPath, "npmrc")}`,
  `--scripts-prepend-node-path=auto`
];

/*
  Windows is terrible and through-out Firepit you'll see references to "safe" and "unsafe" paths.
  Unsafe paths, on Windows, are ones with things like spaces in them - yes spaces break stuff.

  There is debate about who is at fault. It may be npm, it may be Node, it may be Microsoft, regardless
  if your username on Windows (for example) has a space in it, it'll break everything.

  Luckily because we control the universe in Firepit, we can use a crazy hack to replace any
  evil (i.e. space-inclusive) paths with DOS (yes DOS) style paths. See getSafeCrossPlatformPath()

  For example:

  unsafePath: C:\Program Files\Java\jdk1.6.0_22
  safePath: C:\PROGRA~1\Java\JDK16~1.0_2

  We use the safePath when needed (specifically when passing them through cmd.exe) to reduce the
  chances of space-related bugs.

  This is needed *all* the time, but it's pretty common in here.
 */
let safeNodePath;
const unsafeNodePath = process.argv[0];

/*
  Firepit supports some additional flags that the firebase command does not. These flags are
  generally used internally when Firepit invokes Firepit (for example, during welcome.js).

  If you want to run any of these flags, invoke Firepit with --tool:$COMMAND
 */
const flagDefinitions = [
  "file-debug",             // --tool:file-debug - Write log to a file
  "log-debug",              // --tool:log-debug - Write log to stdout
  "disable-write",          // --tool:disable-write - Do not write runtime scripts to filesystem
  "runtime-check",          // --tool:runtime-check - Determine if firepit binary is node or not (see VerifyNodePath())
  "setup-check",            // --tool:setup-check - Check if firebase-tools is set up
  "force-setup",            // --tool:force-setup - Force Firepit to go through setup
  "force-update",           // --tool:force-update - Aggressively clear npm cache and re-setup
  "ignore-embedded-cache"   // --tool:ignore-embedded-cache - Setup from online, do not use embedded firebase-tools
];

/*
  This script parses our flagDefinitions and returns a map like {file-debug: false, ...}
 */
const flags = flagDefinitions.reduce((flags, name) => {
  flags[name] = process.argv.indexOf(`--tool:${name}`) !== -1;
  if (flags[name]) {
    process.argv.splice(process.argv.indexOf(`--tool:${name}`), 1);
  }

  return flags;
}, {});

/*
  We use @zeit/pkg to actually bundle our JavaScript with the NodeJS runtime to produce our binaries.
  In general if you're running your code inside of pkg and you attempt to spawn the pkg binary which
  you invoked to run your code (i.e. firepit.exe invokes firepit.exe) what you'll actually be
  invoking is the underlying Node.js binary which is embedded is the binary.

  This works well, albeit it may be a bit unexpected, however due to the nature of Firepit,
  there's no assurance that we'll actually be in the same process at any given time.

  For example, if we invoke "./firepit" and Firepit spawns a shell and that shell is used to call "firebase"
  we're now in a situation where invoking "./firepit" from "firebase" will act as a fresh call to
  Firepit, resulting it in running through the setup and such.

  In another example, if we invoke "./firepit" and it immediately spawns "./firepit" then it'll
  be spawning a node process.

  I know this is confusing, but the moral is that we can be sure at any moment if spawning "./firepit"
  will provide us with this file running in Node or just a Node runtime.

  To detect what the "firepit" binary is we run "./firepit check.js --tool:runtime-check" in
  VerifyNodePath(). If "./firepit" is acting as Firepit, this conditional will flip and we'll
  just exit out. If "./firepit" is acting as a Node runtime, it'll invoke check.js and return
  a unicode ✓. This allows us to know if we can safely invoke Node scripts by calling ourselves
  or if we must call "./firepit is:node ./script" to force it to manually imitate Node.
 */
if (flags["runtime-check"]) {
  console.log(`firepit invoked for runtime check, exiting subpit.`);
  return;
}

debug(`Welcome to firepit v${version}!`);

/*

  -------------------------------------
  The Main Path
  -------------------------------------

  When running Firepit, we start here. This async closure handles checking most of the --tool flags
  and ensuring that Firepit is setup and in-place before running firepit()
*/
(async () => {
  /*
    Any time we invoke a child process from Firepit, we tack on a FIREPIT_VERSION env variable.
    This is useful here so we can detect if we are the "top level" Firepit instance.

    For example, if you are running Firepit in headful mode then the first instance of Firepit
    spawns you a command prompt window. In that command prompt we go through welcome.js then
    you're given access to the "firebase" command.

    When you run "firebase", if we didn't know if we were top-level then you'd just spawn another
    command prompt window - clearly not what we want. So we look for the env variable set by the
    process which spawned the window. If it exists, we functionally fall into "headless" mode
    and act like a normal Firebase CLI.
   */
  const isTopLevel = !process.env.FIREPIT_VERSION;

  /*
    As I mentioned above, we make heavy use of this function to DOS-isy paths to avoid space-issues.
    In this case, we're using process.argv[0] (always a reference to the node binary which spawned
    this script) and turning it safe so we have an invokable Node.js runtime for later.
   */
  safeNodePath = await getSafeCrossPlatformPath(isWindows, process.argv[0]);
  /*
    If the user has ever had an older version of Firepit, clear it out and replace it with us.
   */
  uninstallLegacyFirepit();

  /*
    --tool:setup-check is used by welcome.js and returns out a JSON list of binaries for the "firebase"
    command. It's essentially a check to see if we can find a copy of "firebase" to invoke.

    The FindTool function looks in several places for where it thinks our firebase script might be
    and returns as many as it fins. We almost always use the 0th one.
   */
  if (flags["setup-check"]) {
    const bins = FindTool("firebase-tools/lib/bin/firebase");

    for (const bin of bins) {
      bins[bin] = await getSafeCrossPlatformPath(bins[bin]);
    }

    console.log(JSON.stringify({ bins }));
    return;
  }


  /*
    --tool:force-update is never used internally, but can be useful for EAPs where version numbers
    may be incorrect. This manually clear NPMs cache and then flips the flags "ignore-embedded-cache"
    and "force-setup" to tell Firepit to install itself from the remote package (either a link to a
    tgz or just firebase-tools@latest).
   */
  if (flags["force-update"]) {
    console.log(`Please wait while we clear npm's cache...`);

    /*
      This is the first instance of invoking one of the Imitate*() methods. These methods are
      the methods which "route" to the underlying scripts for each command. As you'd expect
      ImitateNPM forces the process to act just like npm.

      By replacing the process.argv before calling ImitateNPM(), we're rewriting what the
      command was which called Firepit. For example, this snippet creates the following command...

        /blah/blah/node ./firepit.js is:npm cache clean --force

      As far as Firepit is concerned, this looks just like invoking it with is:npm from the top.

      It may be cleaner to have Imitate*() take an array of command strings instead of modifying
      process.argv, but for now I'll leave it like this.
     */
    process.argv = [
      ...process.argv.slice(0, 2),
      "is:npm",
      "cache",
      "clean",
      "--force"
    ];

    /*
      The Imitate*() methods also always return codes (0, 1, 2) from the underlying script. We
      need to make sure we bubble these up because incorrect handling of exit codes will create
      unexpected behavior in scripts.
     */
    const code = await ImitateNPM();

    if (code) {
      console.log("NPM cache clearing failed, can't update.");
      process.exit(code);
    }

    flags["ignore-embedded-cache"] = true;
    flags["force-setup"] = true;
    console.log(`Clearing out your firebase-tools setup...`);

    /*
      Here's a handy use of shelljs. It's stupidly hard to recursively remove a directory with
      Node's standard libs. Shelljs makes it trivial.
     */
    shell.rm("-rf", installPath);
  }

  /*
    Every time Firepit is invoked it recreates the runtime binaries (node, npm, shell) because
    these binaries need to know the current location of the Firepit binary. See the function
    comments for more.
   */
  await createRuntimeBinaries();

  /*
    If we're in --tool:force-setup then extract or remotely install firebase-tools then exit out.
   */
  if (flags["force-setup"]) {
    debug("Forcing setup...");
    await SetupFirebaseTools();
    console.log("firebase-tools setup complete.");
    return;
  }

  /*
    As I mentioned above, isTopLevel is basically the same as headless mode. There's an entire flow
    here which revolves around invoking "./welcome.js" See that script for more details
   */
  if (isTopLevel && !config.headless) {
    const welcome_path = await getSafeCrossPlatformPath(
      isWindows,
      path.join(__dirname, "/welcome.js")
    );

    const firebaseToolsCommand = await getFirebaseToolsCommand();

    /*
      This function adds a directory onto the PATH env variable. On Windows they're ; separated
      and *nix they're : seperated.
     */
    appendToPath(isWindows, [path.join(installPath, "bin"), runtimeBinsPath]);

    /*
      As I mentioned above, we set the FIREPIT_VERSION env variable so that the shell we spawn
      doesn't spawn another window and it instead acts as a headless firepit.
     */
    const shellEnv = {
      FIREPIT_VERSION: version,
      ...process.env
    };

    if (isWindows) {
      /*
        This is some of the only platform specific bits we have here. On Windows, headful mode spawns
        a custom cmd.exe prompt with doskey (alias) commands called to expose the "firebase" and "npm"
        commands. We also set the prompt to a neat yellow ">" then invoke the welcome script.

        This top level Firepit script sits open until the developer closes that terminal.
       */
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
      /*
        If we're not on Windows, then we can technically perform headful mode on Mac. By default double-clicking
        a binary on Mac will pop up a terminal, so we just invoke the welcome screen and set the bash prompt.
       */
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
      In the case that Firepit is not in headful mode (or it was loaded in headful more, but is
      not the top level process), then we jump into the actual firepit() method which takes care
      of routing the is:npm, is:node, or other core modes.
    */
    SetWindowTitle("Firebase CLI");
    await firepit();
  }

  if (flags["file-debug"]) {
    fs.writeFileSync("firepit-log.txt", debug.log.join("\n"));
  }
})().catch(err => {
  /*
    Note we have a high-level catch here which attempts to catch any crazy firepit errors. This is
    rarely hit, but it will produce a firepit-log.txt when some internal errors occur.
   */
  debug(err.toString());
  console.log(
    `This tool has encountered an error. Please file a bug on Github (https://github.com/firebase/firebase-tools/) and include firepit-log.txt`
  );
  fs.writeFileSync("firepit-log.txt", debug.log.join("\n"));
});


async function firepit() {
  /*
    When running inside Node, the "node" binary is stored in many places. As I mentioned earlier,
    it's the 0th item of process.argv and it's also in a couple other places. To be safe we
    get a "safe" version of the Node runtime path and replace all known references with this.
   */
  runtimeBinsPath = await getSafeCrossPlatformPath(isWindows, runtimeBinsPath);

  // TODO: I'm not sure this is needed, more testing would be useful.
  process.argv[0] = safeNodePath;
  process.env.NODE = safeNodePath;
  process.env._ = safeNodePath;

  debug(safeNodePath);
  debug(process.argv);

  // TODO: This may not be needed since we invoke createRuntimeBinaries() earlier
  await createRuntimeBinaries();
  appendToPath(isWindows, [runtimeBinsPath]);

  /*
    We check for the is:npm and is:node flags and if either exist, we opt ot imitate that process
    and then exit out when done.
   */
  if (process.argv.indexOf("is:npm") !== -1) {
    const code = await ImitateNPM();
    process.exit(code);
  }

  if (process.argv.indexOf("is:node") !== -1) {
    const code = await ImitateNode();
    process.exit(code);
  }

  /*
    If Firepit was invoked in headless mode, there is a chance that firebase-tools has not been set
    up yet (since the welcome screen was never shown and that script is what calls --tool:forces-setup.

    To be sure, we attempt to find the firebase-tools script and if it's not found, we attempt a setup.

    After the setup, if the script still isn't found then something is wrong and we die.
   */
  let firebaseBins = FindTool("firebase-tools/lib/bin/firebase");
  if (!firebaseBins.length) {
    debug(`CLI not found! Invoking setup...`);
    await SetupFirebaseTools();
    firebaseBins = FindTool("firebase-tools/lib/bin/firebase");
  }

  /*
    Assuming we've gotten this far, we've found the CLI and we're ready to run firebase-tools.
    That was easy, huh?
   */
  const firebaseBin = firebaseBins[0];
  debug(`CLI install found at "${firebaseBin}", starting fork...`);
  const code = await ImitateFirebaseTools(firebaseBin);
  process.exit(code);
}

/*
  -------------------------------------
  Imitate*()
  -------------------------------------

  All of the Imitate*() methods are very similar. For is:npm and is:node we break process.argv
  based on that string and then pass everything on the right to the script, which is forked from
  the main Node process. We create a promise (which can be awaited) and then resolve when the
  command is done.
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

/*
  -------------------------------------
  Core Functions
  -------------------------------------
 */

async function createRuntimeBinaries() {
  /*
    As discussed in the introduction, Firepit isn't *just* firebase-tools, it's also npm and node.
    We need it to act as several CLI tools in order to support firebase-tools because it shells out
    to these other commands in some situations.

    In order to support this we add a few special scripts onto the users's path so when a user (or
    script) invokes "npm" or "node" it redirects back into Firepit so we can control the environment
    regardless of how that command was invoked.

    To do this cross-platform, we need to create both shell and batch scripts (for nix / windows).
    These scripts are kept very minimal, as you can see in runtimeBins, they're mostly one line or
    two.

    Each of the platform-specific scripts like "shell" or "node.bat" do the absolute minimum work
    needed to act as an executable binary, then immediately redirect the arguments passed to it
    back into Firepit via the "shell.js" or "node.js" scripts. (See runtime.js for contents). These
    two scripts do the majority of heavy lifting in terms of imitating npm or node.

    Originally, we implemented the node / npm stand-ins in pure bash or batch, however there was
    way too much platform specific code, by redirecting us back into Firepit (and Node) we add
    another process, but we also dramatically reduce per-platform code. The Node code is
    cross-platform and works perfectly everywhere. It's also easier to test because any *nix
    machine can functionally test the same code that would run on Windows or vice-versa.
   */
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

  /*
    We handle creating the runtimeBins files by looping through and writing files. There's nothing
    special or interesting here.
   */

  try {
    shell.mkdir("-p", runtimeBinsPath);
  } catch (err) {
    debug(err);
  }

  if (!flags["disable-write"]) {
    Object.keys(runtimeBins).forEach(filename => {
      const runtimeBinPath = path.join(runtimeBinsPath, filename);
      try {
        shell.rm("-rf", runtimeBinPath);
      } catch (err) {
        debug(err);
      }
      fs.writeFileSync(runtimeBinPath, runtimeBins[filename]);
      shell.chmod("+x", runtimeBinPath);
    });
  }
  debug("Runtime binaries created.");
}


async function SetupFirebaseTools() {
  /*
    Firepit supports "setting up" (that is, installing) firebase-tools in two ways.

    1) Use the copy of firebase-tools which is stored inside the firepit binary at
       join(__dirname, "vendor/node_modules/firebase-tools")
    2) Use a copy of firebase-tools installed via npm via the internet.
   */
  debug(`Attempting to install to "${installPath}"`);

  const original_argv = [...process.argv];
  const nodeModulesPath = path.join(installPath, "lib");
  const binPath = path.join(installPath, "bin");
  debug(shell.mkdir("-p", nodeModulesPath).toString());
  debug(shell.mkdir("-p", binPath).toString());

  /*
    In general, we use the embedded version of firebase-tools. Once installed, this version can be
    upgraded via npm, however it's important to skip npm for the initial setup as it's dramatically
    faster.
   */

  if (!flags["ignore-embedded-cache"]) {
    /*
      When doing the embedded install, the setup is as simple as cp -R'ing the JavaScript files
      to the right place then linking the script to a bin folder (see below).
     */
    debug("Using embedded cache for quick install...");
    debug(
      shell
        .cp("-R", path.join(__dirname, "vendor/*"), nodeModulesPath)
        .toString()
    );
  } else {
    /*
      When doing a remote install, we ImitateNPM and run a normal npm install. Note that we're
      installing both firebase-tools and "npm" because this will upgrade the copy of npm used
      by Firepit. Better up-to-date than sorry!
     */
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
  }

  /*
    When installing remotely, npm automatically links the firebase-tools script to a binary folder,
    however sometimes this doesn't happen as expected, so we manually call shell.ln (link) to create
    a symlink regardless of the install type.

    This step ensures that whether the firebase-tools install was created from the remote or
    local install that the binary still exists in the same place.

    Note we can not simply move firebase.js because it uses imports relative to it's position in
    the node_modules tree.
   */
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

  /*
    Finally we check to make sure we now have a copy of the "firebase" command which is findable
    and then restore the original process.argv before finishing the setup.
   */
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
  /*
    There are two situations where we should trash the Firepit install directory.

    1) We're using an old firepit version where the "cli" folder exists
    2) We're using an old firebase-tools version where the version is different than ours.
   */

  /*
    To detect an old-style Firepit install, we look for the "cli" folder, a folder which has
    been renmaed in new Firepit builds.
   */
  const isLegacyFirepit = !shell.ls(
    path.join(homePath, ".cache", "firebase", "cli")
  ).code;

  /*
    To check for mismatched firebase-tools versions, we find the package.json and read the version
    manually then compare it to ours.
   */
  let installedFirebaseToolsPackage = {};
  const installedFirebaseToolsPackagePath = path.join(
    homePath,
    ".cache/firebase/tools/lib/node_modules/firebase-tools/package.json"
  );
  const firepitFirebaseToolsPackagePath = path.join(
    __dirname,
    "vendor/node_modules/firebase-tools/package.json"
  );
  debug(`Doing JSON parses for version checks at ${firepitFirebaseToolsPackagePath}`);
  debug(shell.ls(path.join(__dirname, "vendor/node_modules/")));
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

  /*
    If either of these conditions are true, we just delete the whole cache and start over fresh.
   */

  if (!isLegacyFirepit && !isLegacyFirebaseTools) return;
  debug("Legacy firepit / firebase-tools detected, clearing it out...");
  debug(shell.rm("-rf", path.join(homePath, ".cache", "firebase")));
}

async function getFirebaseToolsCommand() {
  /*
    This helper function produces an absolute, cross-platform "firebase" command reference.

    It outputs either "c:\path\to\firebase.exe" or "c:\path\to\firebase.exe path\to\firebase.js"
    As discussed above, whether running the firepit binary results in a Node.js runtime or the
    "firebase" command can change (seemingly randomly, but it's not) depending on if we're
    inside of an existing pkg process. Doing this check ensures that we get a command which
    when ran results in "firebase" being ran regardless of environment.
   */
  const isRuntime = await VerifyNodePath(safeNodePath);
  debug(`Node path ${safeNodePath} is runtime? ${isRuntime}`);

  let firebase_command;
  if (isRuntime) {
    const script_path = await getSafeCrossPlatformPath(
      isWindows,
      path.join(__dirname, "/firepit.js")
    );
    //TODO: We should store this as an array to prevent issues with spaces
    firebase_command = `${safeNodePath} ${script_path}`;
  } else {
    firebase_command = safeNodePath;
  }
  debug(firebase_command);
  return firebase_command;
}

async function VerifyNodePath(nodePath) {
  /*
    VerifyNodePath invokes the firepit binary with two flags...

    ./firepit check.js --tool:runtime-check

    This allows us to determine if the current environment is internal to pkg or not. When it's
    internal, meaning that the invocation of firepit is a direct child of another firepit process
    then ./firepit will invoke the node runtime which is bundled within the firepit binary.

    When it's not internal, it will run the firepit scripts.

    This check works because with these flags ./firepit call will run check.js and return a
    checkmark if it's acting as the Node runtime and if it's not it will just log something
    else and exit.

    We use this to ensure that we can always build a command which invokes the Firebase CLI
    regardless of where the process is actually being spawned.
   */
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
    This method returns a list of files which match the script name provided. We use this to
    locate npm, firebase-tools, etc.
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

function SetWindowTitle(title) {
  /*
    This method *attempts* to set the terminal window title to something pretty so it doesn't
    show the internal shell'ing we do. It kinda works, but fails silently, so I've left it in.
   */
  if (isWindows) {
    process.title = title;
  }
}


/*
  -------------------------------------
  Shared Functions
  -------------------------------------

  These methods are very special and should be edited carefully. They must be pure JavaScript
  functions which do not rely on any global state or imports.

  If you look at createRuntimeBinaries() and see the runtimeBins scripts, you'll see that we
  call getSafeCrossPlatformPath.toString() and appendToPath.toString() and put them into the
  scripts which we place on the filesystem. We do this because the scripts in ./runtime.js
  depend on these functions and since we need to create single JavaScript files to drop onto
  the user's filesystem, we concat them together.

  This is fairly dangerous, but we don't have many options.
 */

async function getSafeCrossPlatformPath(isWin, path) {
  /*
    This function generates "safe" DOS style file paths on Windows.

    For example:

    unsafePath: C:\Program Files\Java\jdk1.6.0_22
    safePath: C:\PROGRA~1\Java\JDK16~1.0_2

    These paths remove spaces and special characters which could interfere with the terminal.
    In theory, it should be possible to avoid this, but because of issues in npm, we need to be
    extra safe about spaces.
   */
  if (!isWin) return path;

  /*
    This is perhaps the biggest hack in Firepit, we shell out to command and run a small script
    which returns the DOS-formatted version of a path. This is not fast, but it's (apparently)
    the only way to fetch the safe version of a path
   */
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
  /*
    This method handles appending a folder to the user's PATH directory in a cross-platform way.

    Windows uses ";" to delimit paths and *nix uses ":"
   */
  const PATH = process.env.PATH;
  const pathSeperator = isWin ? ";" : ":";

  process.env.PATH = [
    ...pathsToAppend,
    ...PATH.split(pathSeperator).filter(folder => folder)
  ].join(pathSeperator);
}

function debug(...msg) {
  /*
    This method creates a debug log which can go to stdout or a file depending on --tool: flags.
   */
  if (!debug.log) debug.log = [];

  if (flags["log-debug"]) {
    msg.forEach(m => console.log(m));
  } else {
    msg.forEach(m => debug.log.push(m));
  }
}
