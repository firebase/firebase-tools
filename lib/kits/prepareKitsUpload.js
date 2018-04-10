"use strict";

var _ = require("lodash");
var archiver = require("archiver");
var chalk = require("chalk");
var filesize = require("filesize");
var fs = require("fs");
var tar = require("tar");
var path = require("path");
var request = require("request");
var tmp = require("tmp");

var fsAsync = require("../fsAsync");
var api = require("../api");
var FirebaseError = require("../error");
var gcp = require("../gcp");
var utils = require("../utils");

var DEFAULT_REGION = gcp.cloudfunctions.DEFAULT_REGION;
var CONFIG_DEST_FILE = ".runtimeconfig.json";

var _pipeAsync = function(from, to) {
  return new Promise(function(resolve, reject) {
    to.on("finish", resolve);
    to.on("error", reject);
    from.pipe(to);
  });
};

function _retrieveFile(githubConfig) {
  var endpoint =
    "/repos/" +
    githubConfig.owner +
    "/" +
    githubConfig.repo +
    "/contents/" +
    githubConfig.manifestPath;
  return api
    .request("GET", endpoint, {
      auth: false,
      origin: "https://api.github.com",
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": githubConfig.repo + "-kitsIntaller",
      },
    })
    .then(function(result) {
      if (result.status !== 200) {
        return Promise.reject(
          new FirebaseError(
            githubConfig.path + " could not be retrieved for kit at " + githubConfig.repo
          )
        );
      }
      var buf = Buffer.from(result.body.content, "base64");
      return Promise.resolve(buf);
    })
    .catch(function(error) {
      return Promise.reject(error);
    });
}

function _downloadSource(githubConfig) {
  var owner = githubConfig.owner;
  var repo = githubConfig.repo;
  var ref = githubConfig.ref;
  var tmpDir = tmp.dirSync({ prefix: "kits-source-" }).name;

  var endpoint = "/repos/" + owner + "/" + repo + "/tarball/" + ref;
  var download = request({
    url: "https://api.github.com" + endpoint,
    headers: {
      Accept: "application/vnd.github.v3.sha",
      "User-Agent": repo + "-kitsIntaller",
    },
  });
  var untar = tar.x({
    cwd: tmpDir,
    // GitHub embeds everything in a folder named as the git
    // <org>-<repo>-<hash>
    strip: 1,
  });
  return _pipeAsync(download, untar).then(
    function() {
      utils.logSuccess(chalk.green.bold("kits: ") + "Fetched kits source code.");
      return tmpDir;
    },
    function(err) {
      throw new FirebaseError("There was an error with fetching the kit", {
        original: err,
        exit: 2,
      });
    }
  );
}

/**
 * Scaffolding code. Adapted from prepareFunctionsUpload.js
 **/
var _packageSource = function(sourceDir, githubContext, configValues) {
  var tmpFile = tmp.fileSync({ prefix: "kits-upload-", postfix: ".zip" }).name;
  var fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    defaultEncoding: "binary",
  });
  var archive = archiver("zip");
  var archiveDone = _pipeAsync(archive, fileStream);

  return fsAsync
    .readdirRecursive({
      path: sourceDir,
      ignore: [
        githubContext.manfiestPath /* kit.json */,
        CONFIG_DEST_FILE /* .runtimeconfig.json */,
        "node_modules",
      ],
    })
    .then(function(files) {
      _.forEach(files, function(file) {
        archive.file(file.name, {
          name: path.relative(sourceDir, file.name),
          mode: file.mode,
        });
      });
      archive.append(JSON.stringify(configValues, null, 2), {
        name: CONFIG_DEST_FILE,
        mode: 420 /* 0o644 */,
      });
      archive.finalize();
      return archiveDone;
    })
    .then(
      function() {
        utils.logBullet(
          chalk.cyan.bold("kits:") +
            " packaged kit source (" +
            filesize(archive.pointer()) +
            ") for uploading"
        );
        return {
          file: tmpFile,
          stream: fs.createReadStream(tmpFile),
          size: archive.pointer(),
        };
      },
      function(err) {
        throw new FirebaseError(
          "Could not read source directory. Remove links and shortcuts and try again.",
          {
            original: err,
            exit: 1,
          }
        );
      }
    );
};

function _uploadSourceCode(projectId, source) {
  var fullUrl;
  return gcp.cloudfunctions
    .generateUploadUrl(projectId, DEFAULT_REGION)
    .then(function(uploadUrl) {
      fullUrl = uploadUrl;
      uploadUrl = _.replace(uploadUrl, "https://storage.googleapis.com", "");
      return gcp.storage.upload(source, uploadUrl);
    })
    .then(function() {
      return fullUrl;
    });
}

function _upload(projectId, githubContext, options) {
  return _downloadSource(githubContext)
    .then(function(sourceDir) {
      return _packageSource(sourceDir, githubContext, options);
    })
    .then(function(source) {
      return _uploadSourceCode(projectId, source);
    });
}

module.exports = {
  retrieveFile: _retrieveFile,
  upload: _upload,
};
