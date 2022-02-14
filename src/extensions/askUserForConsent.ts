import * as _ from "lodash";
import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer = require("marked-terminal");

import { FirebaseError } from "../error";
import { logPrefix } from "../extensions/extensionsHelper";
import * as extensionsApi from "./extensionsApi";
import * as iam from "../gcp/iam";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Returns a string that will be displayed in the prompt to user.
 * @param extensionName name or ID of the extension (i.e. firestore-bigquery-export)
 * @param projectId ID for the project where we are trying to install an extension into
 * @param roles the role(s) we would like to grant to the service account managing the extension
 * @return {string} description of roles to prompt user for permission
 */
export async function formatDescription(extensionName: string, projectId: string, roles: string[]) {
  const question = `${clc.bold(
    extensionName
  )} will be granted the following access to project ${clc.bold(projectId)}`;
  const results: string[] = await Promise.all(
    roles.map((role: string) => {
      return retrieveRoleInfo(role);
    })
  );
  results.unshift(question);
  return _.join(results, "\n");
}

/**
 * Returns a string representing a Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details on parameters of a Role.
 * @param role to get info for
 * @return {string} string representation for role
 */
export async function retrieveRoleInfo(role: string) {
  const res = await iam.getRole(role);
  return `- ${res.title} (${res.description})`;
}

/**
 * Displays roles that will be granted to the extension instance and corresponding descriptions.
 * @param extensionName name of extension to install/update
 * @param projectId ID of user's project
 * @param roles roles that require user approval
 */
export async function displayRoles(
  extensionName: string,
  projectId: string,
  roles: string[]
): Promise<void> {
  if (!roles.length) {
    return;
  }

  const message = await formatDescription(extensionName, projectId, roles);
  utils.logLabeledBullet(logPrefix, message);
}

/**
 * Displays APIs that will be enabled for the project and corresponding descriptions.
 * @param extensionName name of extension to install/update
 * @param projectId ID of user's project
 * @param apis APIs that require user approval
 */
export function displayApis(extensionName: string, projectId: string, apis: extensionsApi.Api[]) {
  if (!apis.length) {
    return;
  }
  const question = `${clc.bold(
    extensionName
  )} will enable the following APIs for project ${clc.bold(projectId)}`;
  const results: string[] = apis.map((api: extensionsApi.Api) => {
    return `- ${api.apiName}: ${api.reason}`;
  });
  results.unshift(question);
  const message = results.join("\n");
  utils.logLabeledBullet(logPrefix, message);
}

/**
 * Displays publisher terms of service and asks user to consent to them.
 * Errors if they do not consent.
 */
export async function promptForPublisherTOS(): Promise<void> {
  const termsOfServiceMsg =
    "By registering as a publisher, you confirm that you have read the Firebase Extensions Publisher Terms and Conditions (linked below) and you, on behalf of yourself and the organization you represent, agree to comply with it.  Here is a brief summary of the highlights of our terms and conditions:\n" +
    "  - You ensure extensions you publish comply with all laws and regulations; do not include any viruses, spyware, Trojan horses, or other malicious code; and do not violate any person’s rights, including intellectual property, privacy, and security rights.\n" +
    "  - You will not engage in any activity that interferes with or accesses in an unauthorized manner the properties or services of Google, Google’s affiliates, or any third party.\n" +
    "  - If you become aware or should be aware of a critical security issue in your extension, you will provide either a resolution or a written resolution plan within 48 hours.\n" +
    "  - If Google requests a critical security matter to be patched for your extension, you will respond to Google within 48 hours with either a resolution or a written resolution plan.\n" +
    "  - Google may remove your extension or terminate the agreement, if you violate any terms.";
  utils.logLabeledBullet(logPrefix, marked(termsOfServiceMsg));
  const consented: boolean = await promptOnce({
    name: "consent",
    type: "confirm",
    message: marked(
      "Do you accept the [Firebase Extensions Publisher Terms and Conditions](https://firebase.google.com/docs/extensions/alpha/terms-of-service) and acknowledge that your information will be used in accordance with [Google's Privacy Policy](https://policies.google.com/privacy?hl=en)?"
    ),
    default: false,
  });
  if (!consented) {
    throw new FirebaseError("You must agree to the terms of service to register a publisher ID.", {
      exit: 1,
    });
  }
}
