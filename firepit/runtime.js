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

/*
-------------------------------------
Runtime Scripts

These functions are not invoked in firepit,
but are written to the filesystem (via Function.toString())
and then invoked from platform-specific .bat or .sh scripts
-------------------------------------
 */

exports.Script_NodeJS = function() {
  const [script, ...otherArgs] = process.argv.slice(2);
  require("child_process")
    .fork(script, otherArgs, {
      env: process.env,
      cwd: process.cwd(),
      stdio: "inherit"
    })
    .on("exit", code => {
      process.exit(code);
    });
};

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
