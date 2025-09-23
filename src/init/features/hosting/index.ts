import * as clc from "colorette";
import { rmSync } from "node:fs";
import { join } from "path";

import { Client } from "../../../apiv2";
import { initGitHub } from "./github";
import { confirm, input, select } from "../../../prompt";
import { logger } from "../../../logger";
import { discover, WebFrameworks } from "../../../frameworks";
import { ALLOWED_SSR_REGIONS, DEFAULT_REGION } from "../../../frameworks/constants";
import * as experiments from "../../../experiments";
import { errNoDefaultSite, getDefaultHostingSite } from "../../../getDefaultHostingSite";
import { Options } from "../../../options";
import { last, logSuccess } from "../../../utils";
import { interactiveCreateHostingSite } from "../../../hosting/interactive";
import { readTemplateSync } from "../../../templates";

const INDEX_TEMPLATE = readTemplateSync("init/hosting/index.html");
const MISSING_TEMPLATE = readTemplateSync("init/hosting/404.html");
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
      // N.B. During prompt migration this did not pass options object, so there is no support
      // for force or nonInteractive; there possibly should be.
      const confirmCreate = await confirm({
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
      setup.hosting.useDiscoveredFramework ??= await confirm({
        message: `Detected an existing ${name} codebase in the current directory, should we use this?`,
        default: true,
      });
    }
    if (setup.hosting.useDiscoveredFramework) {
      setup.hosting.source = ".";
      setup.hosting.useWebFrameworks = true;
    } else {
      setup.hosting.useWebFrameworks = await confirm(
        `Do you want to use a web framework? (${clc.bold("experimental")})`,
      );
    }
  }

  if (setup.hosting.useWebFrameworks) {
    setup.hosting.source ??= await input({
      message: "What folder would you like to use for your web application's root directory?",
      default: "hosting",
    });

    if (setup.hosting.source !== ".") delete setup.hosting.useDiscoveredFramework;
    discoveredFramework = await discover(join(config.projectDir, setup.hosting.source));

    if (discoveredFramework) {
      const name = WebFrameworks[discoveredFramework.framework].name;
      setup.hosting.useDiscoveredFramework ??= await confirm({
        message: `Detected an existing ${name} codebase in ${setup.hosting.source}, should we use this?`,
        default: true,
      });
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

      setup.hosting.whichFramework =
        setup.hosting.whichFramework ||
        (await select({
          message: "Please choose the framework:",
          default: defaultChoice,
          choices,
        }));

      if (discoveredFramework) rmSync(setup.hosting.source, { recursive: true });
      await WebFrameworks[setup.hosting.whichFramework].init!(setup, config);
    }

    setup.hosting.region =
      setup.hosting.region ||
      (await select({
        message: "In which region would you like to host server-side content, if applicable?",
        default: DEFAULT_REGION,
        choices: ALLOWED_SSR_REGIONS.filter((region) => region.recommended),
      }));

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

    setup.hosting.public =
      setup.hosting.public ||
      (await input({
        message: "What do you want to use as your public directory?",
        default: "public",
      }));
    setup.hosting.spa =
      setup.hosting.spa ||
      (await confirm("Configure as a single-page app (rewrite all urls to /index.html)?"));

    setup.config.hosting = {
      public: setup.hosting.public,
      ignore: DEFAULT_IGNORES,
    };
  }

  setup.hosting.github =
    setup.hosting.github || (await confirm("Set up automatic builds and deploys with GitHub?"));

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
