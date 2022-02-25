import * as identityPlatform from "../../../gcp/identityPlatform";

export interface AuthBlockingOptions {
  idToken: boolean;
  accessToken: boolean;
  refreshToken: boolean;
}

export function oneBeforeCreate(): boolean {
  return false;
}

export function oneBeforeSignIn(): boolean {
  return false;
}

/**
 * 
 * @param eventName 
 * @param fnUri 
 * @param fnOpts 
 * 
 * URL is https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config
 * PATCH something like this:
{
  "blockingFunctions": {
    "triggers": {
      "beforeCreate": {
        "functionUri": "https://us-central1-cole-pineapple.cloudfunctions.net/authBlockerFromPortal",
        "updateTime": "2022-01-28T18:45:55.252Z"
      },
      "beforeSignIn": {
        "functionUri": "https://us-central1-cole-pineapple.cloudfunctions.net/authBlockerFromPortal",
        "updateTime": "2022-01-28T18:45:55.252Z"
      }
    },
    "forwardInboundCredentials": {
      "idToken": false,
      "accessToken": true,
      "refreshToken": true
    }
  }
}
 */
export async function updateIdentityPlatformConfig(
  eventName: string,
  fnUri: string,
  fnOpts: AuthBlockingOptions
): Promise<identityPlatform.Config> {
  const config = {
    blockingFunctions: {
      triggers: {
        beforeCreate: {
          // functionUri:
        },
        beforeSignIn: {
          // functionUri:
        },
      },
      forwardInboundCredentials: {
        idToken: fnOpts.idToken,
        accessToken: fnOpts.accessToken,
        refreshToken: fnOpts.refreshToken,
      },
    },
  };

  return await identityPlatform.updateConfig({});
}
