import { Command } from "../command";
import { start } from "repl";
import { yellow, red, bold } from "cli-color";
import * as admin from "firebase-admin";
import { getFirebaseConfig } from "../functionsConfig";
import { getAccessToken } from "../api";
import { getRefreshToken } from "../auth";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { createContext, runInContext, Context, Script } from "vm";
import { readFileSync, existsSync } from "fs";
import fetch, { Response } from "node-fetch";
import { DocumentSnapshot, Firestore, QuerySnapshot } from "@google-cloud/firestore";
import api = require("../api");
import { inspect } from "util";

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
      let result = await Promise.resolve(
        // Wrap in an async function to allow top-level await.
        runInContext(`(async function(){ return ${command}; })()`, sandbox)
      );

      if (result instanceof QuerySnapshot) {
        result = result.docs.map((doc) => simpleDocSnapshot(doc));
      } else if (result instanceof DocumentSnapshot) {
        result = simpleDocSnapshot(result);
      } else if (typeof result.val === "function") {
        result = result.val();
      } else if (result instanceof Response) {
        if (result.headers.get("content-type")?.includes("application/json")) {
          result = await result.json();
        } else {
          result = await result.text();
        }
      }

      callback(null, result);
    } catch (e) {
      callback(e);
    }
  }

  const replServer = start({
    prompt: `${yellow("firebase")}${red(">")} `,
    eval: shellEval,
    // writer: replWriter,
  });

  return new Promise(function (resolve) {
    replServer.on("exit", resolve);
    process.on("SIGINT", resolve);
  });
}

function simpleDocSnapshot(snap: DocumentSnapshot) {
  return Object.assign({ __id__: snap.id }, snap.data());
}

module.exports = new Command("shell [script_path]")
  .description("an interactive shell for admin project access")
  .before(requireAuth)
  .action(async (scriptPath: string, options: any) => {
    const sdkConfig = await getFirebaseConfig(options);
    admin.initializeApp(Object.assign({}, sdkConfig, { credential: { getAccessToken } }));
    const accessToken = ((await getAccessToken()) as any).access_token;

    const firestoreConfig = {
      projectId: sdkConfig.projectId,
      credentials: {
        type: "authorized_user",
        client_id: api.clientId,
        client_secret: api.clientSecret,
        refresh_token: getRefreshToken(),
      } as any,
    };

    const firestoreClient = new Firestore(firestoreConfig);

    const sandbox = {
      require,
      console,
      sdkConfig,
      admin: {
        auth: () => admin.auth(),
        database: () => admin.database(),
        firestore: () => firestoreClient,
        messaging: () => admin.messaging(),
        projectManagement: () => admin.projectManagement(),
        securityRules: () => admin.securityRules(),
        storage: () => admin.storage(),
      },
      accessToken,
      fetch,
    };

    createContext(sandbox);

    if (scriptPath) {
      return runScript(sandbox, scriptPath);
    }

    return runRepl(sandbox);
  });
