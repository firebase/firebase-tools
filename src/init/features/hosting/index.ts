import * as clc from "colorette";
import { existsSync, rmSync } from "node:fs";
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
import { logSuccess } from "../../../utils";
import { pickHostingSiteName } from "../../../hosting/interactive";
import { readTemplateSync } from "../../../templates";
import { FirebaseError } from "../../../error";
import { Setup } from "../..";
import { Config } from "../../../config";
import { createSite } from "../../../hosting/api";

const INDEX_TEMPLATE = readTemplateSync("init/hosting/index.html");
const MISSING_TEMPLATE = readTemplateSync("init/hosting/404.html");
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];

export interface RequiredInfo {
  newSiteId?: string;
  source?: string;
  useWebFrameworks?: boolean;
  useDiscoveredFramework?: boolean;
  webFramework?: string;
  region?: string;
  public?: string;
  spa?: boolean;
}

// TODO: come up with a better way to type this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askQuestions(setup: Setup, config: Config, options: Options): Promise<void> {
  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.hosting = {};

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

    if (
      !hasHostingSite &&
      (await confirm({
        message: "A Firebase Hosting site is required to deploy. Would you like to create one now?",
        default: true,
      }))
    ) {
      const createOptions = {
        projectId: setup.projectId,
        nonInteractive: options.nonInteractive,
      };
      setup.featureInfo.hosting.newSiteId = await pickHostingSiteName("", createOptions);
    }
  }

  if (experiments.isEnabled("webframeworks")) {
    let discoveredFramework = experiments.isEnabled("webframeworks")
      ? await discover(config.projectDir, false)
      : undefined;
    // First, if we're in a framework directory, ask to use that.
    if (
      discoveredFramework &&
      (await confirm({
        message: `Detected an existing ${WebFrameworks[discoveredFramework.framework].name} codebase in the current directory, do you want to use this?`,
        default: true,
      }))
    ) {
      setup.featureInfo.hosting.source = ".";
      setup.featureInfo.hosting.useWebFrameworks = true;
      setup.featureInfo.hosting.useDiscoveredFramework = true;
      setup.featureInfo.hosting.webFramework = discoveredFramework.framework;
      // Otherwise, just ask if they want to use web frameworks.
    } else {
      setup.featureInfo.hosting.useWebFrameworks = await confirm(
        `Do you want to use a web framework? (${clc.bold("experimental")})`,
      );
    }
    // If they say yes, ask for source directory if its not already known
    if (setup.featureInfo.hosting.useWebFrameworks) {
      setup.featureInfo.hosting.source ??= await input({
        message: "What folder would you like to use for your web application's root directory?",
        default: "hosting",
      });

      discoveredFramework = await discover(
        join(config.projectDir, setup.featureInfo.hosting.source),
      );

      if (discoveredFramework) {
        const name = WebFrameworks[discoveredFramework.framework].name;
        setup.featureInfo.hosting.useDiscoveredFramework ??= await confirm({
          message: `Detected an existing ${name} codebase in ${setup.featureInfo.hosting.source}, should we use this?`,
          default: true,
        });
        if (setup.featureInfo.hosting.useDiscoveredFramework)
          setup.featureInfo.hosting.webFramework = discoveredFramework.framework;
      }

      // If it is not known already, ask what framework to use.
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

      setup.featureInfo.hosting.webFramework ??= await select({
        message: "Please choose the framework:",
        default: defaultChoice,
        choices,
      });

      setup.featureInfo.hosting.region =
        setup.featureInfo.hosting.region ||
        (await select({
          message: "In which region would you like to host server-side content, if applicable?",
          default: DEFAULT_REGION,
          choices: ALLOWED_SSR_REGIONS.filter((region) => region.recommended),
        }));
    }
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

    setup.featureInfo.hosting.public ??= await input({
      message: "What do you want to use as your public directory?",
      default: "public",
    });
    setup.featureInfo.hosting.spa ??= await confirm(
      "Configure as a single-page app (rewrite all urls to /index.html)?",
    );
  }
  // GitHub Action set up is still structured as doSetup
  if (await confirm("Set up automatic builds and deploys with GitHub?")) {
    return initGitHub(setup);
  }
}

// TODO: come up with a better way to type this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function actuate(setup: Setup, config: Config, options: Options): Promise<void> {
  const hostingInfo = setup.featureInfo?.hosting;
  if (!hostingInfo) {
    throw new FirebaseError(
      "Could not find hosting info in setup.featureInfo.hosting. This should not happen.",
      { exit: 2 },
    );
  }

  if (hostingInfo.newSiteId && setup.projectId) {
    await createSite(setup.projectId, hostingInfo.newSiteId);
    logger.info();
    logSuccess(`Firebase Hosting site ${hostingInfo.newSiteId} created!`);
    logger.info();
  }

  if (hostingInfo.webFramework) {
    if (!hostingInfo.useDiscoveredFramework) {
      if (hostingInfo.source && existsSync(hostingInfo.source)) {
        rmSync(hostingInfo.source, { recursive: true });
      }
      await WebFrameworks[hostingInfo.webFramework].init!(setup, config);
    }
    setup.config.hosting = {
      source: hostingInfo.source,
      // TODO swap out for framework ignores
      ignore: DEFAULT_IGNORES,
      frameworksBackend: {
        region: hostingInfo.region,
      },
    };
  } else {
    setup.config.hosting = {
      public: hostingInfo.public,
      ignore: DEFAULT_IGNORES,
    };

    if (hostingInfo.spa) {
      setup.config.hosting.rewrites = [{ source: "**", destination: "/index.html" }];
    } else {
      // SPA doesn't need a 404 page since everything is index.html
      await config.askWriteProjectFile(
        `${hostingInfo.public}/404.html`,
        MISSING_TEMPLATE,
        !!options.force,
      );
    }

    const c = new Client({ urlPrefix: "https://www.gstatic.com", auth: false });
    const response = await c.get<{ current: { version: string } }>("/firebasejs/releases.json");
    await config.askWriteProjectFile(
      `${hostingInfo.public}/index.html`,
      INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version),
      !!options.force,
    );
  }
}
