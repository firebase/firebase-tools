import { execSync } from "child_process";
import * as clc from "cli-color";
import * as fs from "fs";
import { sync as rimraf } from "rimraf";

import { Client } from "../../../apiv2";
import { initGitHub } from "./github";
import { prompt } from "../../../prompt";
import { logger } from "../../../logger";
import { discover, WebFramework } from "../../../frameworks";
import { previews } from "../../../previews";

const INDEX_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/index.html",
  "utf8"
);
const MISSING_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/404.html",
  "utf8"
);
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];

export async function doSetup(setup: any, config: any): Promise<void> {
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

  let discoveredFramework = previews.frameworkawareness ?
    await discover(config.projectDir, false) :
    undefined;

  if (previews.frameworkawareness) {

    if (discoveredFramework) await prompt(setup.hosting, [
      {
        name: "useDiscoveredFramework",
        type: "confirm",
        default: true,
        message: `Detected an existing ${discoveredFramework.framework} codebase in ., should we use this?`,
      },
    ]);

    if (setup.hosting.useDiscoveredFramework) {
      setup.hosting.source = '.';
      setup.hosting.useWebFrameworks = true;
    } else {
      await prompt(setup.hosting, [
        {
          name: "useWebFrameworks",
          type: "confirm",
          default: false,
          message: `Do you want to use a web framework?`,
        },
      ]);
    }
  }

  if (setup.hosting.useWebFrameworks) {

    await prompt(setup.hosting, [
        {
          name: "source",
          type: "input",
          default: "hosting",
          message: "What folder would you like to use for your web application's root directory?",
        },
      ]
    );

    if (setup.hosting.source !== '.') delete setup.hosting.useDiscoveredFramework;
    discoveredFramework = await discover(setup.hosting.source);

    if (discoveredFramework) await prompt(setup.hosting, [
      {
        name: "useDiscoveredFramework",
        type: "confirm",
        default: true,
        message: `Detected an existing ${discoveredFramework.framework} codebase in ${setup.hosting.source}, should we use this?`,
      },
    ]);

    if (setup.hosting.useDiscoveredFramework) {

      setup.hosting.webFramework = discoveredFramework!.framework;

    } else {

      await prompt(setup.hosting, [
        {
          name: "webFramework",
          type: "list",
          message: "Please choose the framework:",
          default: discoveredFramework?.framework,
          choices: [
            { name: "Angular", value: WebFramework.Angular },
            { name: "Next.js", value: WebFramework.NextJS },
            { name: "Nuxt", value: WebFramework.Nuxt },
            { name: "Vite", value: WebFramework.Vite },
          ],
        },
      ]);

      if (discoveredFramework) rimraf(setup.hosting.source);

      if (setup.hosting.webFramework === WebFramework.Angular) {
        execSync(`npx --yes -p @angular/cli@latest ng new ${setup.hosting.source} --skip-git`, {stdio: 'inherit'})
        await prompt(setup.hosting, [
          {
            name: "useAngularUniversal",
            type: "confirm",
            default: false,
            message: `Would you like to setup Angular Universal?`,
          },
        ]);
        if (setup.hosting.useAngularUniversal) {
          execSync('ng add @nguniversal/express-engine --skip-confirmation', {stdio: 'inherit', cwd: setup.hosting.source });
        }
      };
      if (setup.hosting.webFramework === WebFramework.NextJS) execSync(`npx --yes create-next-app@latest ${setup.hosting.source}`, {stdio: 'inherit'});
      if (setup.hosting.webFramework === WebFramework.Nuxt) {
        execSync(`npx --yes nuxi@latest init ${setup.hosting.source}`, {stdio: 'inherit'});
        execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
      }
      if (setup.hosting.webFramework === WebFramework.Vite) {
        execSync(`npx create-vite ${setup.hosting.source}`, {stdio: 'inherit'});
        execSync(`cd ${setup.hosting.source}`, {stdio: 'inherit'});
        execSync(`npm install`, {stdio: 'inherit', cwd: setup.hosting.source });
      }
    }

    setup.config.hosting = {
      source: setup.hosting.source,
      // TODO swap out for framework ignores
      ignore: DEFAULT_IGNORES,
    };

  } else {

    await prompt(setup.hosting, [
      {
        name: "public",
        type: "input",
        default: "public",
        message: "What do you want to use as your public directory?",
      },
    ]);

    await prompt(setup.hosting, [
      {
        name: "spa",
        type: "confirm",
        default: false,
        message: "Configure as a single-page app (rewrite all urls to /index.html)?",
      },
    ]);

    setup.config.hosting = {
      public: setup.hosting.public,
      ignore: DEFAULT_IGNORES,
    };

  }

  await prompt(setup.hosting, [
    {
      name: "github",
      type: "confirm",
      default: false,
      message: "Set up automatic builds and deploys with GitHub?",
    },
  ]);

  if (!setup.hosting.useWebFrameworks) {

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

  }

  if (setup.hosting.github) {
    return initGitHub(setup);
  }
}
