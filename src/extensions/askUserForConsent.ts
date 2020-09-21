import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import TerminalRenderer = require("marked-terminal");

import { FirebaseError } from "../error";
import { logPrefix } from "../extensions/extensionsHelper";
import * as iam from "../gcp/iam";
import { promptOnce, Question } from "../prompt";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Returns a string that will be displayed in the prompt to user.
 * @param {string} role
 * @return {!Promise<string>}
 */
export async function formatDescription(extensionName: string, projectId: string, roles: string[]) {
  const question = `${clc.bold(
    extensionName
  )} will be granted the following access to project ${clc.bold(projectId)}`;
  const results: string[] = await Promise.all(
    roles.map(async (role: string) => {
      return await retrieveRoleInfo(role);
    })
  );
  results.unshift(question);
  return _.join(results, "\n");
}

/**
 * Returns a string representing a Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details on parameters of a Role.
 * @param {string} role
 * @return {!Promise<string>}
 */
export async function retrieveRoleInfo(role: string) {
  const res = await iam.getRole(role);
  return `- ${res.title} (${res.description})`;
}

/**
 * Displays roles and corresponding descriptions and asks user for consent
 * @param {Array<string>} roles
 * @return {Promise<?>}
 */
export async function prompt(extensionName: string, projectId: string, roles: string[]) {
  if (!roles || !roles.length) {
    return Promise.resolve();
  }

  const message = await formatDescription(extensionName, projectId, roles);
  utils.logLabeledBullet(logPrefix, message);
  const question: Question = {
    name: "consent",
    type: "confirm",
    message: "Would you like to continue?",
    default: true,
  };
  const consented = await promptOnce(question);
  if (!consented) {
    throw new FirebaseError(
      "Without explicit consent for the roles listed, we cannot deploy this extension.",
      { exit: 1 }
    );
  }
}

/**
 * Displays publisher terms of service and asks user to consent to them.
 * Errors if they do not consent.
 */
export async function promptForPublisherTOS() {
  const termsOfServiceMsg =
    "By registering this publisher ID, you acknowledge the Firebase Extensions publisher " +
    "terms of service and understand the responsibilities you assume when distributing " +
    `an extension. ${clc.blue("More details here: <Placeholder link to docs>")}`;
  utils.logLabeledBullet(logPrefix, marked(termsOfServiceMsg));
  const question: Question = {
    name: "consent",
    type: "confirm",
    message: "Do you agree to the terms above and want to continue registering a publisher ID?",
    default: false,
  };
  const consented: boolean = await promptOnce(question);
  if (!consented) {
    throw new FirebaseError("You must agree to the terms of service to register a publisher ID.", {
      exit: 1,
    });
  }
}
