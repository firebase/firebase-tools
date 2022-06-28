/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as proto from "./proto";
import { identityOrigin } from "../api";
import { Client } from "../apiv2";

const API_VERSION = "v2";

const adminApiClient = new Client({
  urlPrefix: identityOrigin + "/admin",
  apiVersion: API_VERSION,
});

export type HashAlgorithm =
  | "HASH_ALGORITHM_UNSPECIFIED"
  | "HMAC_SHA256"
  | "HMAC_SHA1"
  | "HMAC_MD5"
  | "SCRYPT"
  | "PBKDF_SHA1"
  | "MD5"
  | "HMAC_SHA512"
  | "SHA1"
  | "BCRYPT"
  | "PBKDF2_SHA256"
  | "SHA256"
  | "SHA512"
  | "STANDARD_SCRYPT";

export interface EmailTemplate {
  senderLocalPart: string;
  subject: string;
  senderDisplayName: string;
  body: string;
  bodyFormat: "BODY_FORMAT_UNSPECIFIED" | "PLAIN_TEXT" | "HTML";
  replyTo: string;
  customized: boolean;
}

export type Provider = "PROVIDER_UNSPECIFIED" | "PHONE_SMS";

export interface BlockingFunctionsConfig {
  triggers?: {
    beforeCreate?: BlockingFunctionsEventDetails;
    beforeSignIn?: BlockingFunctionsEventDetails;
  };
  forwardInboundCredentials?: BlockingFunctionsOptions;
}

export interface BlockingFunctionsEventDetails {
  functionUri?: string;
  updateTime?: string;
}

export interface BlockingFunctionsOptions {
  idToken?: boolean;
  accessToken?: boolean;
  refreshToken?: boolean;
}

export interface Config {
  name?: string;
  signIn?: {
    email?: {
      enabled: boolean;
      passwordRequired: boolean;
    };
    phoneNumber?: {
      enabled: boolean;
      testPhoneNumbers: Record<string, string>;
    };
    anonymous?: {
      enabled: boolean;
    };
    allowDuplicateEmails?: boolean;
    hashConfig?: {
      algorithm: HashAlgorithm;
      signerKey: string;
      saltSeparator: string;
      rounds: number;
      memoryCost: number;
    };
  };
  notification?: {
    sendEmail: {
      method: "METHOD_UNSPECIFIED" | "DEFAULT" | "CUSTOM_SMTP";
      resetPasswordTemplate: EmailTemplate;
      verifyEmailTemplate: EmailTemplate;
      changeEmailTemplate: EmailTemplate;
      legacyResetPasswordTemplate: EmailTemplate;
      callbackUri: string;
      dnsInfo: {
        customDomain: string;
        useCustomDomain: boolean;
        pendingCustomDomain: string;
        customDomainState:
          | "VERIFICATION_STATE_UNSPECIFIED"
          | "NOT_STARTED"
          | "IN_PROGRESS"
          | "FAILED"
          | "SUCCEEDED";
        domainVerificationRequestTime: string;
      };
      revertSecondFactorAdditionTemplate: EmailTemplate;
      smtp: {
        senderEmail: string;
        host: string;
        port: number;
        username: string;
        password: string;
        securityMode: "SECURITY_MODE_UNSPECIFIED" | "SSL" | "START_TLS";
      };
    };
    sendSms: {
      useDeviceLocale?: boolean;
      smsTemplate?: {
        content?: string;
      };
    };
    defaultLocale?: string;
  };
  quota?: {
    signUpQuotaConfig?: {
      quota?: string;
      startTime?: string;
      quotaDuration?: string;
    };
  };
  monitoring?: {
    requestLogging?: {
      enabled?: boolean;
    };
  };
  multiTenant?: {
    allowTenants?: boolean;
    defaultTenantLocation?: string;
  };
  authorizedDomains?: Array<string>;
  subtype?: "SUBTYPE_UNSPECIFIED" | "IDENTITY_PLATFORM" | "FIREBASE_AUTH";
  client?: {
    apiKey?: string;
    permissions?: {
      disabledUserSignup?: boolean;
      disabledUserDeletion?: boolean;
    };
    firebaseSubdomain?: string;
  };
  mfa?: {
    state?: "STATE_UNSPECIFIED" | "DISABLED" | "ENABLED" | "MANDATORY";
    enabledProviders?: Array<Provider>;
  };
  blockingFunctions?: BlockingFunctionsConfig;
}

/**
 * Helper function to get the blocking function config from identity platform.
 * @param project GCP project ID or number
 * @returns the blocking functions config
 */
export async function getBlockingFunctionsConfig(
  project: string
): Promise<BlockingFunctionsConfig> {
  const config = (await getConfig(project)) || {};
  if (!config.blockingFunctions) {
    config.blockingFunctions = {};
  }
  return config.blockingFunctions;
}

/**
 * Gets the identity platform configuration.
 * @param project GCP project ID or number
 * @returns the identity platform config
 */
export async function getConfig(project: string): Promise<Config> {
  const response = await adminApiClient.get<Config>(`projects/${project}/config`);
  return response.body;
}

/**
 * Helper function to set the blocking function config to identity platform.
 * @param project GCP project ID or number
 * @param blockingConfig the blocking functions configuration to update
 * @returns the blocking functions config
 */
export async function setBlockingFunctionsConfig(
  project: string,
  blockingConfig: BlockingFunctionsConfig
): Promise<BlockingFunctionsConfig> {
  const config =
    (await updateConfig(project, { blockingFunctions: blockingConfig }, "blockingFunctions")) || {};
  if (!config.blockingFunctions) {
    config.blockingFunctions = {};
  }
  return config.blockingFunctions;
}

/**
 * Sets the identity platform configuration.
 * @param project GCP project ID or number
 * @param config the configuration to update
 * @param updateMask optional update mask for the API
 * @returns the updated config
 */
export async function updateConfig(
  project: string,
  config: Config,
  updateMask?: string
): Promise<Config> {
  if (!updateMask) {
    updateMask = proto.fieldMasks(config).join(",");
  }
  const response = await adminApiClient.patch<Config, Config>(
    `projects/${project}/config`,
    config,
    {
      queryParams: {
        updateMask,
      },
    }
  );
  return response.body;
}
