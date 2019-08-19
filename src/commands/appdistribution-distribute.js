"use strict";

const Command = require("../command");
const utils = require("../utils");
const requireAuth = require("../requireAuth");
const fs = require("fs");
const crypto = require("crypto");
const req = require("../appdistribution/requests");
const dist = require("../appdistribution/distribution");
const FirebaseError = require("../error");

const _ensureFileExists = function(file, message = "") {
  if (!fs.existsSync(file)) {
    throw new FirebaseError("File " + file + " does not exist. " + message);
  }
};

const _getAppId = function(appId) {
  if (!appId) {
    throw new FirebaseError("Set the --app option to a valid Firebase app id and try again");
  }
  return appId;
};

const _getDistribution = function(distributionFile) {
  if (!distributionFile) {
    throw new FirebaseError("Must specify a distribution file");
  }

  const distributionType = distributionFile.split(".").pop();
  if (
    distributionType !== dist.DistributionFileType.IPA &&
    distributionType !== dist.DistributionFileType.APK
  ) {
    throw new FirebaseError("Unsupported distribution file format, should be .ipa or .apk");
  }

  _ensureFileExists(distributionFile, "Verify that file points to a distribution.");
  return new dist.Distribution(distributionFile, distributionType);
};

const _getReleaseNotes = function(releaseNotes, releaseNotesFile) {
  if (releaseNotes) {
    return releaseNotes;
  } else if (releaseNotesFile) {
    _ensureFileExists(releaseNotesFile);
    return fs.readFileSync(releaseNotesFile, "utf8");
  }
};

const _getTestersOrGroups = function(value, file) {
  if (!value && file) {
    _ensureFileExists(file);
    value = fs.readFileSync(file, "utf8");
  }

  if (value) {
    return value
      .split(/,|\n/)
      .map((entry) => entry.trim())
      .filter((entry) => !!entry);
  }
};

module.exports = new Command("appdistribution:distribute [file]")
  .description("Upload a distribution")
  .option("--app <app_id>", "The app id of your Firebase app")
  .option("--release-notes <string>", "Release notes to include with this distribution")
  .option(
    "--release-notes-file <file>",
    "Path to file with release notes to include with this distribution"
  )
  .option("--testers <string>", "A comma separated list of tester emails to distribute to")
  .option(
    "--testers-file <file>",
    "Path to file with a comma separated list of tester emails to distribute to"
  )
  .option("--groups <string>", "A comma separated list of group aliases to distribute to")
  .option(
    "--groups-file <file>",
    "Path to file with a comma separated list of group aliases to distribute to"
  )
  .before(requireAuth)
  .action(function(file, options) {
    const appId = _getAppId(options.app);
    const distribution = _getDistribution(file);
    const releaseNotes = _getReleaseNotes(options.releaseNotes, options.releaseNotesFile);
    const testers = _getTestersOrGroups(options.testers, options.testersFile);
    const groups = _getTestersOrGroups(options.groups, options.groupsFile);

    const requests = new req.AppDistributionRequests(appId);

    const releaseHashPromise = new Promise((resolve) => {
      const hash = crypto.createHash("sha1");
      const stream = distribution.readStream();
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => {
        return resolve(hash.digest("hex"));
      });
    });

    return requests
      .provisionApp()
      .catch((err) => {
        return utils.reject("Failed to provision app with " + err.message, { exit: 1 });
      })
      .then(() =>
        releaseHashPromise
          .then((releaseHash) => {
            return requests.getReleaseIdByHash(releaseHash);
          })
          .then((releaseId) => {
            utils.logWarning("This distribution has been uploaded before, skipping upload");
            return releaseId;
          })
          .catch(() => {
            utils.logBullet("Uploading distribution...");
            return requests.getJwtToken().then((token) =>
              requests
                .uploadDistribution(token, distribution)
                .then((etag) => requests.pollReleaseIdByHash(etag))
                .then((releaseId) => {
                  utils.logSuccess("Uploaded distribution successfully");
                  return releaseId;
                })
                .catch((err) => {
                  return utils.reject("Failed to upload distribution. " + err.message, { exit: 1 });
                })
            );
          })
      )
      .then((releaseId) => {
        return requests.addReleaseNotes(releaseId, releaseNotes).then(() => {
          return requests.enableAccess(releaseId, testers, groups);
        });
      });
  });
