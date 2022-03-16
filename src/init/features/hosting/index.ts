import * as clc from "cli-color";
import * as fs from "fs";

import { Client } from "../../../apiv2";
import { initGitHub } from "./github";
import { prompt } from "../../../prompt";
import { logger } from "../../../logger";
import { Options } from "../../../options";

const INDEX_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/index.html",
  "utf8"
);
const MISSING_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/404.html",
  "utf8"
);
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];

export async function doSetup(setup: any, config: any, options: Options): Promise<void> {
  setup.hosting = {};

  logger.info();
  logger.info(
    `Your ${clc.bold("public")} directory is the folder (relative to your project directory) that`
  );
  logger.info(
    `will contain Hosting assets to be uploaded with ${clc.bold("firebase deploy")}. If you`
  );
  logger.info("have a build process for your assets, use your build's output directory.");
  logger.info();

  await prompt(setup.hosting, [
    {
      name: "public",
      type: "input",
      default: "public",
      message: "What do you want to use as your public directory?",
    },
    {
      name: "spa",
      type: "confirm",
      default: false,
      message: "Configure as a single-page app (rewrite all urls to /index.html)?",
    },
    {
      name: "github",
      type: "confirm",
      default: false,
      message: "Set up automatic builds and deploys with GitHub?",
    },
  ]);

  setup.config.hosting = {
    public: setup.hosting.public,
    ignore: DEFAULT_IGNORES,
  };

  if (setup.hosting.spa) {
    setup.config.hosting.rewrites = [{ source: "**", destination: "/index.html" }];
  } else {
    // SPA doesn't need a 404 page since everything is index.html
    await config.askWriteProjectFile(`${setup.hosting.public}/404.html`, MISSING_TEMPLATE);
  }

  const c = new Client({ urlPrefix: "https://www.gstatic.com", auth: false });
  const response = await c.get<{ current: { version: string } }>("/firebasejs/releases.json");
  await config.askWriteProjectFile(
    `${setup.hosting.public}/index.html`,
    INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version)
  );
  if (setup.hosting.github) {
    return initGitHub(setup, config, options);
  }
}
