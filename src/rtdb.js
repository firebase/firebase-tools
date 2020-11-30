"use strict";

var api = require("./api");
var { FirebaseError } = require("./error");
var utils = require("./utils");
const { populateInstanceDetails } = require("./management/database");
const { realtimeOriginOrCustomUrl } = require("./database/api");
exports.updateRules = function(projectId, instance, src, options) {
  options = options || {};
  var path = ".settings/rules.json";
  if (options.dryRun) {
    path += "?dryRun=true";
  }
  var downstreamOptions = { instance: instance, project: projectId };
  return populateInstanceDetails(downstreamOptions)
    .then(function() {
      const origin = utils.getDatabaseUrl(
        realtimeOriginOrCustomUrl(downstreamOptions.instanceDetails.databaseUrl),
        instance,
        ""
      );
      return api.request("PUT", path, {
        origin: origin,
        auth: true,
        data: src,
        json: false,
        resolveOnHTTPError: true,
      });
    })
    .then(function(response) {
      if (response.status === 400) {
        throw new FirebaseError(
          "Syntax error in database rules:\n\n" + JSON.parse(response.body).error
        );
      } else if (response.status > 400) {
        throw new FirebaseError("Unexpected error while deploying database rules.", { exit: 2 });
      }
    });
};
