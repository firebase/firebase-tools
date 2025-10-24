#!/usr/bin/env node
import * as packageJson from "../package.json";
import { select } from "../../src/prompt.js";
import { Command as FirebaseCommand } from '../../src/command';
import { Command } from "commander";
import { setUpDataConnectTemplate } from "./templates/data-connect.js";
import { requireAuth } from "../../src/requireAuth";

interface CreateFirebaseAppOptions {
  framework?: string;
  product?: string;
  appName: string;
}

const command = new Command(packageJson.name)
  .option("--framework <string>", "Whether you want an angular or Next.js app")
  .option("--product <string>", "What firebase product you want to use")
  .option("--app-name <string>", "Name of the app", "web-app")
  .action(async (options: CreateFirebaseAppOptions) => {
    const firebaseCmd = new FirebaseCommand(packageJson.name);
    firebaseCmd.prepare(options);
  await requireAuth(options, false);
    const framework =
      options.framework ||
      (await select({
        choices: ["angular", "next"],
        message: "Which framework do you want to use?",
      }));
    if(framework === 'next') {
      // ask follow-up question for what product to use.
        const product = options.product || (await select({
            choices: ['Data Connect'],
            message: "What firebase product you want to use?",
        }));
        if(product === 'Data Connect') {
            await setUpDataConnectTemplate(options.appName);
        }
    }
  });
command.parse();
