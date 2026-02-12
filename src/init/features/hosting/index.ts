import * as clc from "colorette";
import { join } from "path";
import { Client } from "../../../apiv2";
import { discover } from "../../../frameworks";
import * as github from "./github";
import { confirm, input } from "../../../prompt";
import { logger } from "../../../logger";
import { errNoDefaultSite, getDefaultHostingSite } from "../../../getDefaultHostingSite";
import { Options } from "../../../options";
import { logSuccess } from "../../../utils";
import { pickHostingSiteName } from "../../../hosting/interactive";
import { readTemplateSync } from "../../../templates";
import { Setup } from "../..";
import { Config } from "../../../config";
import { createSite } from "../../../hosting/api";
import { FirebaseError } from "../../../error";

const INDEX_TEMPLATE = readTemplateSync("init/hosting/index.html");
const MISSING_TEMPLATE = readTemplateSync("init/hosting/404.html");
const DEFAULT_IGNORES = ["firebase.json", "**/.*", "**/node_modules/**"];

export interface RequiredInfo {
  redirectToAppHosting?: boolean;
  newSiteId?: string;
  public?: string;
  spa?: boolean;
}

// TODO: come up with a better way to type this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askQuestions(setup: Setup, config: Config, options: Options): Promise<void> {
  // Detect frameworks first, before asking any hosting questions
  const discoveredFramework = await discover(config.projectDir, false);
  if (discoveredFramework && discoveredFramework.mayWantBackend) {
    const frameworkName = discoveredFramework.framework;
    logger.info();
    logger.info(
      `Detected a ${frameworkName} codebase. Setting up ${clc.bold("App Hosting")} instead.`,
    );
    setup.featureInfo ||= {};
    setup.featureInfo.hosting = { redirectToAppHosting: true };
    setup.features?.unshift("apphosting");
    return;
  }

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

  // GitHub Action set up is still structured as doSetup
  if (await confirm("Set up automatic builds and deploys with GitHub?")) {
    return github.initGitHub(setup);
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

  // if the user was redirected to App Hosting, we don't need to do anything here
  if (hostingInfo.redirectToAppHosting) {
    return;
  }

  if (hostingInfo.newSiteId && setup.projectId) {
    await createSite(setup.projectId, hostingInfo.newSiteId);
    logger.info();
    logSuccess(`Firebase Hosting site ${hostingInfo.newSiteId} created!`);
    logger.info();
  }

  setup.config.hosting = {
    public: hostingInfo.public,
    ignore: DEFAULT_IGNORES,
  };

  if (hostingInfo.spa) {
    setup.config.hosting.rewrites = [{ source: "**", destination: "/index.html" }];
  } else {
    // SPA doesn't need a 404 page since everything is index.html
    await config.askWriteProjectFile(
      join(hostingInfo.public ?? "public", "404.html"),
      MISSING_TEMPLATE,
      !!options.force,
    );
  }

  const c = new Client({ urlPrefix: "https://www.gstatic.com", auth: false });
  const response = await c.get<{ current: { version: string } }>("/firebasejs/releases.json");
  await config.askWriteProjectFile(
    join(hostingInfo.public ?? "public", "index.html"),
    INDEX_TEMPLATE.replace(/{{VERSION}}/g, response.body.current.version),
    !!options.force,
  );
}
