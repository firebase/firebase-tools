import { Command } from "../command";
import { start } from "repl";
import { yellow, red, bold } from "cli-color";
import * as admin from "firebase-admin";
import { getFirebaseConfig } from "../functionsConfig";
import { getAccessToken } from "../api";
import requireAuth = require("../requireAuth");
import { FirebaseError } from "../error";
import { createContext, runInContext, Context, Script } from "vm";
import { readFileSync, existsSync } from "fs";

async function runScript(sandbox: Context, scriptPath: string) {
  if (!existsSync(scriptPath)) {
    throw new FirebaseError(`Script file ${bold(scriptPath)} does not exist.`);
  }

  try {
    const script = new Script(readFileSync(scriptPath, { encoding: "utf8" }), {
      filename: scriptPath,
    });
    return await Promise.resolve(script.runInContext(sandbox));
  } catch (e) {
    // show the full stacktrace for the user's custom script
    throw new FirebaseError(`Error running script: ${e.stack}`);
  }
}

function runRepl(sandbox: Context) {
  async function shellEval(command: string, context: any, filename: string, callback: any) {
    try {
      const result = await Promise.resolve(
        // Wrap in an async function to allow top-level await.
        runInContext(`(async function(){ return ${command}; })()`, sandbox)
      );
      callback(null, result);
    } catch (e) {
      callback(e);
    }
  }

  const replServer = start({
    prompt: `${yellow("firebase")}${red(">")} `,
    eval: shellEval,
    // writer: sqlWriter,
  });

  return new Promise(function(resolve) {
    replServer.on("exit", resolve);
    process.on("SIGINT", resolve);
  });
}

module.exports = new Command("shell [script_path]")
  .description("an interactive shell for admin project access")
  .before(requireAuth)
  .action(async (scriptPath: string, options: any) => {
    const sdkConfig = await getFirebaseConfig(options);
    admin.initializeApp(Object.assign({}, sdkConfig, { credential: { getAccessToken } }));
    const accessToken = ((await getAccessToken()) as any).access_token;

    const sandbox = {
      require,
      console,
      sdkConfig,
      admin,
      accessToken,
      request: require("request-promise"),
    };
    createContext(sandbox);

    if (scriptPath) {
      return runScript(sandbox, scriptPath);
    }

    return runRepl(sandbox);
  });
