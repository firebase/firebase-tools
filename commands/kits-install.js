"use strict";

var clc = require("cli-color");

var Command = require("../lib/command");
var getProjectId = require("../lib/getProjectId");
var logger = require("../lib/logger");
var requireAccess = require("../lib/requireAccess");
var scopes = require("../lib/scopes");
var utils = require("../lib/utils");
var kits = require("../lib/kits");

// TODO: add option for urlPath to be inserted or parse urlPath for name if needed
module.exports = new Command("kits:install <githubRepo>")
  .option("-b, --branch <branch>", "repository branch to download from. Defaults to master")
  .option("-p, --path <path>", "custom path to kit configuration file. Defaults to kits.json")
  .option("--id <releaseId>", "release version to be installed. Defaults to latest")
  .before(requireAccess, [scopes.CLOUD_PLATFORM])
  .action(function(githubRepo, options) {
    var projectId = getProjectId(options);
    var kit = githubRepo.split("/");

    var kitOwner;
    var kitRepo;

    if (kit.length > 1) {
      kitOwner = kit[0];
      kitRepo = kit[1];
    } else {
      kitOwner = "function-kits";
      kitRepo = kit[0];
    }

    var githubConfig = {
      id: options.releaseId || "latest",
      owner: kitOwner,
      manifestPath: options.path || "kits.json",
      ref: options.branch || "master",
      repo: kitRepo,
    };

    var gitRepo = kitOwner + "/" + kitRepo;
    var kitFunctions;
    var runtimeConfig;

    return kits.prepareKitsUpload
      .retrieveFile(githubConfig)
      .then(function(result) {
        var kitConfig = JSON.parse(result);
        kitFunctions = kitConfig.functions;

        utils.logSuccess(
          clc.green.bold("kits: ") + "Fetched configuration file from " + clc.bold(gitRepo)
        );
        utils.logBullet(clc.bold("We will now ask a series of questions to help set up your kit."));

        return kits.prepareKitsConfig.prompt(githubConfig.repo, kitConfig.config);
      })
      .then(function(result) {
        runtimeConfig = result;

        return kits.prepareKitsUpload.upload(projectId, githubConfig, runtimeConfig);
      })
      .then(function(sourceUploadUrl) {
        utils.logSuccess(clc.green.bold("kits: ") + "Completed configuration setup.");
        logger.debug(clc.bold("kits: ") + "Source uploaded to GCS bucket");
        utils.logBullet(
          "Deploying kit " + gitRepo + " as " + clc.bold(runtimeConfig.kitname + "...")
        );

        return kits.deploy(kitFunctions, options, runtimeConfig, sourceUploadUrl);
      });
  });
