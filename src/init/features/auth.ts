import * as clc from "colorette";
import { Config } from "../../config";
import { Setup } from "..";
import { checkbox, confirm, input } from "../../prompt";
import { logger } from "../../logger";
import { Options } from "../../options";
import { errNoDefaultSite, getDefaultHostingSite } from "../../getDefaultHostingSite";
import { pickHostingSiteName } from "../../hosting/interactive";
import { createSite } from "../../hosting/api";
import { logSuccess } from "../../utils";

export interface AuthInfo {
  providers: {
    anonymous?: boolean;
    emailPassword?: boolean;
    googleSignIn?: {
      oAuthBrandDisplayName: string;
      supportEmail: string;
    };
  };
  newSiteId?: string;
}

/**
 * Asks questions to configure Firebase Authentication and checks for a default Hosting site.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
export async function askQuestions(
  setup: Setup,
  config?: Config,
  options?: Options,
): Promise<void> {
  const authConfig = setup.config.auth;
  const choices = [
    {
      name: "Google Sign-In",
      value: "google",
      checked: !!authConfig?.providers?.googleSignIn,
    },
    {
      name: "Email/Password",
      value: "email",
      checked: !!authConfig?.providers?.emailPassword,
    },
    {
      name: "Anonymous",
      value: "anonymous",
      checked: !!authConfig?.providers?.anonymous,
    },
  ];

  const providers = await checkbox<string>({
    message:
      "Which providers would you like to enable? If you don't see a provider here, go to the Firebase Console to set it up.",
    choices: choices,
  });

  const providersConfig: AuthInfo["providers"] = {};

  if (providers.includes("anonymous")) {
    providersConfig.anonymous = true;
  }

  if (providers.includes("email")) {
    providersConfig.emailPassword = true;
  }

  if (providers.includes("google")) {
    logger.info("");
    logger.info("Configuring Google Sign-In...");

    const project = setup.project as { projectId?: string } | undefined;
    const defaultDisplayName =
      authConfig?.providers?.googleSignIn?.oAuthBrandDisplayName || project?.projectId || "My App";

    const oAuthBrandDisplayName = await input({
      message: "What display name would you like to use for your OAuth brand?",
      default: defaultDisplayName,
    });

    const defaultEmail =
      authConfig?.providers?.googleSignIn?.supportEmail ||
      (project?.projectId ? `support@${project.projectId}.firebaseapp.com` : undefined);

    const supportEmail = await input({
      message: "What support email would you like to register for your OAuth brand?",
      default: defaultEmail,
    });

    providersConfig.googleSignIn = {
      oAuthBrandDisplayName,
      supportEmail,
    };
  }

  let newSiteId: string | undefined;
  if (setup.projectId) {
    let hasHostingSite = false;
    let existingSite: string | undefined = setup.featureInfo?.hosting?.newSiteId;
    if (existingSite) {
      hasHostingSite = true;
    } else {
      try {
        existingSite = await getDefaultHostingSite({ projectId: setup.projectId });
        hasHostingSite = true;
      } catch (err: unknown) {
        if (err !== errNoDefaultSite) {
          throw err;
        }
        hasHostingSite = false;
      }
    }

    if (hasHostingSite && existingSite) {
      logger.info(`Firebase Hosting site is present: ${clc.bold(existingSite)}.`);
    } else if (
      await confirm({
        message:
          "A Firebase Hosting site is required for Firebase Authentication. Would you like to create a default site now?",
        default: true,
      })
    ) {
      const createOptions = {
        projectId: setup.projectId,
        nonInteractive: options?.nonInteractive,
      };
      newSiteId = await pickHostingSiteName("", createOptions);
    }
  }

  if (!setup.featureInfo) {
    setup.featureInfo = {};
  }
  setup.featureInfo.auth = { providers: providersConfig, newSiteId };
}

/**
 * Actuates the setup by creating a Hosting site (if requested) and writing auth config to firebase.json.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 */
export async function actuate(setup: Setup, config: Config): Promise<void> {
  const authConfig = setup.featureInfo?.auth;

  if (!authConfig) {
    return;
  }

  if (authConfig.newSiteId && setup.projectId) {
    await createSite(setup.projectId, authConfig.newSiteId);
    logger.info("");
    logSuccess(`Firebase Hosting site ${authConfig.newSiteId} created!`);
    logger.info("");
  }

  config.set("auth", { providers: authConfig.providers });
  config.writeProjectFile("firebase.json", config.src);

  logger.info("");
  logger.info("Generated firebase.json with auth configuration.");
  logger.info("Run " + clc.bold("firebase deploy") + " to enable these providers.");
}
