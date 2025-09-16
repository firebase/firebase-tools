import packageJson from "../package.json";
import { select } from "../../src/prompt";
import { Command } from "commander";
import { setUpDataConnectTemplate } from "./templates/data-connect";

interface CreateFirebaseAppOptions {
  framework?: string;
  product?: string;
}

const command = new Command(packageJson.name)
  .option("-- framework <string>", "Whether you want an angular or Next.js app")
  .option("-- product <string>", "What firebase product you want to use")
  .action(async (options: CreateFirebaseAppOptions) => {
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
            message: "What firebase product do you want to use?",
        }));
        if(product === 'Data Connect') {
            await setUpDataConnectTemplate();
        }
    }
  });
command.parse();
