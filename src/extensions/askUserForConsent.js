"use strict";

const _ = require("lodash");
const clc = require("cli-color");

const { FirebaseError } = require("../error");
const iam = require("../gcp/iam");
const { promptOnce } = require("../prompt");
const utils = require("../utils");

/**
 * Returns a string that will be displayed in the prompt to user.
 * @param {string} role
 * @return {!Promise<string>}
 */
function _formatDescription(modName, projectId, roles) {
  const question = `${clc.bold(modName)} will be granted the following access to project ${clc.bold(
    projectId
  )}`;
  return Promise.all(_.map(roles, (role) => module.exports._retrieveRoleInfo(role))).then(
    (results) => {
      results.unshift(question);
      return _.join(results, "\n");
    }
  );
}

/**
 * Returns a string representing a Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details on parameters of a Role.
 * @param {string} role
 * @return {!Promise<string>}
 */
function _retrieveRoleInfo(role) {
  return iam.getRole(role).then((result) => {
    return `- ${result.title} (${result.description})`;
  });
}

/**
 * Displays roles and corresponding descriptions and asks user for consent
 * @param {Array<string>} roles
 * @return {Promise<?>}
 */
function _prompt(modName, projectId, roles) {
  if (!roles || !roles.length) {
    return Promise.resolve();
  }

  return _formatDescription(modName, projectId, roles)
    .then(function(message) {
      utils.logLabeledBullet("extensions", message);
      const question = {
        name: "consent",
        type: "confirm",
        message: "Would you like to continue?",
        default: true,
      };
      return promptOnce(question);
    })
    .then((consented) => {
      if (!consented) {
        throw new FirebaseError(
          "Without explicit consent for the roles listed, we cannot deploy this mod.",
          { exit: 2 }
        );
      }
    });
}

module.exports = {
  prompt: _prompt,

  // For tests
  _formatDescription: _formatDescription,
  _retrieveRoleInfo: _retrieveRoleInfo,
};
