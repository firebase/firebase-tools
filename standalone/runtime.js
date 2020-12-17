/*
  -------------------------------------
  Introduction: Runtime Scripts
  -------------------------------------

  These functions are not invoked in the main firepit runtime
  but are written to the filesystem (via Function.toString())
  and then invoked from platform-specific .bat or .sh scripts

  Each of these scripts is designed to mimic a specific command
  which the Firebase CLI shells out to. It takes the same arguments
  and routes them to the correct place based on what the
  top-level command is.
 */

/*
  -------------------------------------
  "node" Command
  -------------------------------------

  This function, when placed into a script with the function
  wrapper will take a command like "node ./script.js --foo'
  and correctly spawn "./script.js" while preserving the
  "--foo" argument.
*/
exports.Script_NodeJS = function() {
  const execArgv = [];
  let script = "";
  const scriptArgv = [];

  /*
  When invoked, this script is passed arguments like...
     node {optional node args starting with --} script {args to the script}
  We loop through the args to split them properly for when we call.fork()
   */
  process.argv.slice(2).forEach((arg) => {
    if (!script) {
      if (arg.startsWith("--")) {
        execArgv.push(arg);
      } else {
        script = arg;
      }
    } else {
      scriptArgv.push(arg);
    }
  });

  require("child_process")
    .fork(script, scriptArgv, {
      env: process.env,
      cwd: process.cwd(),
      stdio: "inherit",
      execArgv
    })
    .on("exit", code => {
      process.exit(code);
    });
};

/*
  -------------------------------------
  "sh" Command
  -------------------------------------

  This function, when placed into a script with the function
  wrapper replicates the behavior of the system shell.

  The main change is that it adds locations onto the
  environment's PATH so it can locate our other shimmed
  tools. It finds references to "node" and ensures that
  they be redirected back into Firepit as well.
*/
exports.Script_ShellJS = async function() {
  const path = require("path");
  const child_process = require("child_process");
  const isWin = process.platform === "win32";
  const args = process.argv.slice(2);

  appendToPath(isWin, [
    __dirname,
    path.join(process.cwd(), "node_modules/.bin")
  ]);

  let index;
  if ((index = args.indexOf("-c")) !== -1) {
    args.splice(index, 1);
  }

  args[0] = args[0].replace(process.execPath, "node");
  let [cmdRuntime, cmdScript, ...otherArgs] = args[0].split(" ");

  if (cmdRuntime === process.execPath) {
    cmdRuntime = "node";
  }

  let cmd;
  if (cmdRuntime === "node") {
    if ([".", "/"].indexOf(cmdScript[0]) === -1) {
      cmdScript = await getSafeCrossPlatformPath(
        isWin,
        path.join(process.cwd(), cmdScript)
      );
    }

    cmd = child_process.fork(cmdScript, otherArgs, {
      env: process.env,
      cwd: process.cwd(),
      stdio: "inherit"
    });
  } else {
    cmd = child_process.spawn(cmdRuntime, [cmdScript, ...otherArgs], {
      env: process.env,
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true
    });
  }

  cmd.on("exit", code => {
    process.exit(code);
  });
};
