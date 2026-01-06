import * as clc from "colorette";
import { Config } from "../../config";
import { Setup } from "..";
import { checkbox, input } from "../../prompt";
import { logger } from "../../logger";

export interface AuthInfo {
  providers: {
    anonymous?: boolean;
    emailPassword?: boolean;
    googleSignIn?: {
      oAuthBrandDisplayName: string;
      supportEmail: string;
    };
  };
}

export async function askQuestions(setup: Setup): Promise<void> {
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

    const oAuthBrandDisplayName = await input({
      message: "What display name would you like to use for your OAuth brand?",
      default:
        authConfig?.providers?.googleSignIn?.oAuthBrandDisplayName ||
        setup.project?.projectId ||
        "My App",
    });

    const supportEmail = await input({
      message: "What support email would you like to register for your OAuth brand?",
      default:
        authConfig?.providers?.googleSignIn?.supportEmail ||
        (setup.project ? `support@${setup.project.projectId}.firebaseapp.com` : undefined),
    });

    providersConfig.googleSignIn = {
      oAuthBrandDisplayName,
      supportEmail,
    };
  }

  if (!setup.featureInfo) {
    setup.featureInfo = {};
  }
  setup.featureInfo.auth = { providers: providersConfig };
}

export async function actuate(setup: Setup, config: Config): Promise<void> {
  const authConfig = setup.featureInfo?.auth;

  if (!authConfig) {
    return;
  }

  config.set("auth", authConfig);
  config.writeProjectFile("firebase.json", config.src);

  logger.info("");
  logger.info("Generated firebase.json with auth configuration.");
  logger.info("Run " + clc.bold("firebase deploy") + " to enable these providers.");
}
