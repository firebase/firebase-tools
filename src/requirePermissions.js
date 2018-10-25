const _ = require("lodash");
const clc = require("cli-color");

const api = require("./api");
const getProjectId = require("./getProjectId");
const requireAuth = require("./requireAuth");
const utils = require("./utils");
const logger = require("./logger");

// Permissions required for all commands.
const BASE_PERMISSIONS = ["firebase.projects.get"];

module.exports = function(options, permissions) {
  const projectId = getProjectId(options);
  const requiredPermissions = BASE_PERMISSIONS.concat(permissions || []).sort();

  return requireAuth(options)
    .then(() => {
      logger.debug(
        "[iam] checking project",
        projectId,
        "for permissions",
        JSON.stringify(requiredPermissions)
      );
      return api.request("POST", `/v1/projects/${projectId}:testIamPermissions`, {
        auth: true,
        data: {
          permissions: requiredPermissions,
        },
        origin: api.resourceManagerOrigin,
      });
    })
    .then(response => {
      const allowedPermissions = (response.body.permissions || []).sort();
      const missingPermissions = _.difference(requiredPermissions, allowedPermissions);

      if (missingPermissions.length > 0) {
        return utils.reject(
          "Authorization failed. This account is missing the following required permissions on project " +
            clc.bold(projectId) +
            ":\n\n  " +
            missingPermissions.join("\n  ")
        );
      }

      return true;
    });
};
