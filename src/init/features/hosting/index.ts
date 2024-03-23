import * as clc from "colorette";
import * as fs from "fs";
import { sync as rimraf } from "rimraf";
import { join } from "path";

import { Client } from "../../../apiv2";
import { initGitHub } from "./github";
import { prompt, promptOnce } from "../../../prompt";
import { logger } from "../../../logger";
import { discover, WebFrameworks } from "../../../frameworks";
import { ALLOWED_SSR_REGIONS, DEFAULT_REGION } from "../../../frameworks/constants";
import * as experiments from "../../../experiments";
import { errNoDefaultSite, getDefaultHostingSite } from "../../../getDefaultHostingSite";
import { Options } from "../../../options";
import { last, logSuccess } from "../../../utils";
import { interactiveCreateHostingSite } from "../../../hosting/interactive";

const INDEX_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/index.html",
  "utf8",
);
const MISSING_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/hosting/404.html",
  "utf8",
);
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];

/**
 * Does the setup steps for Firebase Hosting.
 * WARNING: #6527 - `options` may not have all the things you think it does.
 */
export async function doSetup(setup: any, config: any, options: Options): Promise<void> {
  setup.hosting = {};

  // There's a path where we can set up Hosting without a project, so if
  // if setup.projectId is empty, we don't do any checking for a Hosting site.
  if (setup.projectId) {
    let hasHostingSite = true;
    try {
      await getDefaultHostingSite({ projectId: setup.projectId });
    } catch (err: unknown) {
      if (err !== errNoDefaultSite) {
        throw err;
      }
      hasHostingSite = false;
    }

    if (!hasHostingSite) {
      const confirmCreate = await promptOnce({
        type: "confirm",
        message: "A Firebase Hosting site is required to deploy. Would you like to create one now?",
        default: true,
      });
      if (confirmCreate) {
        const createOptions = {
          projectId: setup.projectId,
          nonInteractive: options.nonInteractive,
        };
        const newSite = await interactiveCreateHostingSite("", "", createOptions);
        logger.info();
        logSuccess(`Firebase Hosting site ${last(newSite.name.split("/"))} created!`);
        logger.info();
      }
    }
  }

  let discoveredFramework = experiments.isEnabled("webframeworks")
    ? await discover(config.projectDir, false)
    : undefined;

  if (experiments.isEnabled("webframeworks")) {
    if (discoveredFramework) {
      const name = WebFrameworks[discoveredFramework.framework].name;
      await promptOnce(
        {
          name: "useDiscoveredFramework",
          type: "confirm",
          default: true,
          message: `Detected an existing ${name} codebase in the current directory, should we use this?`,
        },
        setup.hosting,
      );
    }
    if (setup.hosting.useDiscoveredFramework) {
      setup.hosting.source = ".";
      setup.hosting.useWebFrameworks = true;
    } else {
      await promptOnce(
        {
          name: "useWebFrameworks",
          type: "confirm",
          default: false,
          message: `Do you want to use a web framework? (${clc.bold("experimental")})`,
        },
        setup.hosting,
      );
    }
  }

  if (setup.hosting.useWebFrameworks) {
    await promptOnce(
      {
        name: "source",
        type: "input",
        default: "hosting",
        message: "What folder would you like to use for your web application's root directory?",
      },
      setup.hosting,
    );

    if (setup.hosting.source !== ".") delete setup.hosting.useDiscoveredFramework;
    discoveredFramework = await discover(join(config.projectDir, setup.hosting.source));

    if (discoveredFramework) {
      const name = WebFrameworks[discoveredFramework.framework].name;
      await promptOnce(
        {
          name: "useDiscoveredFramework",
          type: "confirm",
          default: true,
          message: `Detected an existing ${name} codebase in ${setup.hosting.source}, should we use this?`,
        },
        setup.hosting,
      );
    }

    if (setup.hosting.useDiscoveredFramework && discoveredFramework) {
      setup.hosting.webFramework = discoveredFramework.framework;
    } else {
      const choices: { name: string; value: string }[] = [];
      for (const value in WebFrameworks) {
        if (WebFrameworks[value]) {
          const { name, init } = WebFrameworks[value];
          if (init) choices.push({ name, value });
        }
      }

      const defaultChoice = choices.find(
        ({ value }) => value === discoveredFramework?.framework,
      )?.value;

      await promptOnce(
        {
          name: "whichFramework",
          type: "list",
          message: "Please choose the framework:",
          default: defaultChoice,
          choices,
        },
        setup.hosting,
      );

      if (discoveredFramework) rimraf(setup.hosting.source);
      await WebFrameworks[setup.hosting.whichFramework].init!(setup, config);
    }

    await promptOnce(
      {
        name: "region",
        type: "list",
        message: "In which region would you like to host server-side content, if applicable?",
        default: DEFAULT_REGION,
        choices: ALLOWED_SSR_REGIONS.filter((region) => region.recommended),
      },
      setup.hosting,
    );

    setup.config.hosting = {
      source: setup.hosting.source,
      // TODO swap out for framework ignores
      ignore: DEFAULT_IGNORES,
      frameworksBackend: {
        region: setup.hosting.region,
      },
    };
  } else {
    logger.info();
    logger.info(
      `Your ${clc.bold("public")} directory is the folder (relative to your project directory) that`,
    );
    logger.info(
      `will contain Hosting assets to be uploaded with ${clc.bold("firebase deploy")}. If you`,
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
    ]);

    setup.config.hosting = {
      public: setup.hosting.public,
      ignore: DEFAULT_IGNORES,
    };
  }

  await promptOnce(
    {
      name: "github",
      type: "confirm",
      default: false,
      message: "Set up automatic builds and deploys with GitHub?",
    },
    setup.hosting,
  );

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
      INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version),
    );
  }

  if (setup.hosting.github) {
    return initGitHub(setup);
  }
}
