import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { AuthConfig } from "../../firebaseConfig";
import { provisionFirebaseApp } from "../../management/provisioning/provision";
import { AppPlatform } from "../../management/apps";
import { FirebaseAuthInput, ProviderMode } from "../../management/provisioning/types";
import { logger } from "../../logger";
import { logSuccess } from "../../utils";

export async function deploy(context: any, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  const config = options.config.src.auth as AuthConfig | undefined;

  if (!config) {
    return;
  }

  const appId = context.auth?.appId;
  if (!appId) {
    return;
  }

  const authInput: FirebaseAuthInput = {};
  const providers = config.providers;

  if (providers) {
    if (providers.anonymous === true) {
      authInput.anonymousAuthProviderMode = ProviderMode.PROVIDER_ENABLED;
    }

    if (providers.emailPassword === true) {
      authInput.emailAuthProviderMode = ProviderMode.PROVIDER_ENABLED;
    }

    if (providers.googleSignIn) {
      authInput.googleSigninProviderMode = ProviderMode.PROVIDER_ENABLED;
      authInput.googleSigninProviderConfig = {
        publicDisplayName: providers.googleSignIn.oAuthBrandDisplayName,
        customerSupportEmail: providers.googleSignIn.supportEmail,
        oauthRedirectUris: providers.googleSignIn.authorizedRedirectUris,
      };
    }
  }

  // If no auth changes, skip
  if (Object.keys(authInput).length === 0) {
    logger.debug("[auth] No auth providers configured to enable.");
    return;
  }

  const enabledProviders: string[] = [];
  if (authInput.anonymousAuthProviderMode === ProviderMode.PROVIDER_ENABLED) {
    enabledProviders.push("anonymous");
  }
  if (authInput.emailAuthProviderMode === ProviderMode.PROVIDER_ENABLED) {
    enabledProviders.push("email/password");
  }
  if (authInput.googleSigninProviderMode === ProviderMode.PROVIDER_ENABLED) {
    enabledProviders.push("Google sign-in");
  }

  logger.info(`Enabling auth providers: ${enabledProviders.join(", ")}...`);

  await provisionFirebaseApp({
    project: {
      parent: {
        type: "existing_project",
        projectId: projectId,
      },
    },
    app: {
      platform: AppPlatform.WEB,
      appId: appId,
    },
    features: {
      firebaseAuthInput: authInput,
    },
  });

  logSuccess(`Auth providers enabled: ${enabledProviders.join(", ")}`);
}
