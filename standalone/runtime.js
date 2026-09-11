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

  if (args.length === 0) {
    process.exit(0);
  }

  let commandToRun;
  if (args[0] === "-c") {
    if (args[1] === "--") {
      commandToRun = args.slice(2).join(" ");
    } else {
      commandToRun = args.slice(1).join(" ");
    }
  } else {
    commandToRun = args.join(" ");
  }

  const cmd = isWin
    ? child_process.spawn("cmd.exe", ["/d", "/s", "/c", commandToRun], {
        env: process.env,
        cwd: process.cwd(),
        stdio: "inherit"
      })
    : child_process.spawn("/bin/sh", ["-c", commandToRun], {
        env: process.env,
        cwd: process.cwd(),
        stdio: "inherit"
      });

  cmd.on("exit", code => {
    process.exit(code !== null ? code : 0);
  });
  cmd.on("error", err => {
    console.error(err);
    process.exit(1);
  });
};
