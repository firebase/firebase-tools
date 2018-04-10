"use strict";

var fs = require("fs-extra");
var path = require("path");

var api = require("./api");
var configstore = require("./configstore");
var logger = require("./logger");

var configDir = function() {
  // Windows has a dedicated low-rights location for apps at ~/Application Data
  if (process.platform === "win32") {
    return process.env.APPDATA;
  }
  return process.env.HOME && path.resolve(process.env.HOME, ".config");
};

/*
Ensures that default credentials are available on the local machine, as specified by:
https://developers.google.com/identity/protocols/application-default-credentials
*/
module.exports = function() {
  if (!configDir()) {
    logger.debug("Cannot ensure default credentials, no home directory found.");
    return;
  }

  var GCLOUD_CREDENTIAL_DIR = path.resolve(configDir(), "gcloud");
  var GCLOUD_CREDENTIAL_PATH = path.join(
    GCLOUD_CREDENTIAL_DIR,
    "application_default_credentials.json"
  );

  var credentials = {
    client_id: api.clientId,
    client_secret: api.clientSecret,
    type: "authorized_user",
    refresh_token: configstore.get("tokens").refresh_token,
  };
  // Mimic the effects of running "gcloud auth application-default login"
  fs.ensureDirSync(GCLOUD_CREDENTIAL_DIR);
  fs.writeFileSync(GCLOUD_CREDENTIAL_PATH, JSON.stringify(credentials, null, 2));
  return;
};
