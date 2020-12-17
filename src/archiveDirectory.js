"use strict";

const _ = require("lodash");
const archiver = require("archiver");
const filesize = require("filesize");
const fs = require("fs");
const path = require("path");
const tar = require("tar");
const tmp = require("tmp");

const { listFiles } = require("./listFiles");
const { FirebaseError } = require("./error");
const fsAsync = require("./fsAsync");
const logger = require("./logger");
const utils = require("./utils");

/**
 * Archives a directory to a temporary file and returns information about the
 * new archive. Defaults to type "tar", and returns a .tar.gz file.
 * @param {string} sourceDirectory
 * @param {!Object<string, *>} options
 * @param {string} options.type Type of directory to create: "tar", or "zip".
 * @param {!Array<string>} options.ignore Globs to be ignored.
 * @return {!Promise<Object<string, *>>} Information about the archive:
 *    - `file`: file name
 *    - `stream`: read stream of the archive
 *    - `manifest`: list of all files in the archive
 *    - `size`: information about the size of the archive
 *    - `source`: the source directory of the archive, for reference
 */
const archiveDirectory = (sourceDirectory, options) => {
  options = options || {};
  let postfix = ".tar.gz";
  if (options.type === "zip") {
    postfix = ".zip";
  }
  const tempFile = tmp.fileSync({
    prefix: "firebase-archive-",
    postfix,
  });

  if (!options.ignore) {
    options.ignore = [];
  }

  let makeArchive;
  if (options.type === "zip") {
    makeArchive = _zipDirectory(sourceDirectory, tempFile, options);
  } else {
    makeArchive = _tarDirectory(sourceDirectory, tempFile, options);
  }
  return makeArchive
    .then((archive) => {
      logger.debug(`Archived ${filesize(archive.size)} in ${sourceDirectory}.`);
      return archive;
    })
    .catch((err) => {
      if (err instanceof FirebaseError) {
        throw err;
      }
      return utils.reject("Failed to create archive.", {
        original: err,
      });
    });
};

/**
 * Archives a directory and returns information about the local archive.
 * @param {string} sourceDirectory
 * @return {!Object<string, *>} Information with the following keys:
 *   - file: name of the temp archive that was created.
 *   - stream: read stream of the temp archive.
 *   - size: the size of the file.
 */
const _tarDirectory = (sourceDirectory, tempFile, options) => {
  const allFiles = listFiles(sourceDirectory, options.ignore);

  // `tar` returns a `TypeError` if `allFiles` is empty. Let's check a feww things.
  try {
    fs.statSync(sourceDirectory);
  } catch (err) {
    if (err.code === "ENOENT") {
      return utils.reject(`Could not read directory "${sourceDirectory}"`);
    }
    throw err;
  }
  if (!allFiles.length) {
    return utils.reject(
      `Cannot create a tar archive with 0 files from directory "${sourceDirectory}"`
    );
  }

  return tar
    .create(
      {
        gzip: true,
        file: tempFile.name,
        cwd: sourceDirectory,
        follow: true,
        noDirRecurse: true,
        portable: true,
      },
      allFiles
    )
    .then(() => {
      const stats = fs.statSync(tempFile.name);
      return {
        file: tempFile.name,
        stream: fs.createReadStream(tempFile.name),
        manifest: allFiles,
        size: stats.size,
        source: sourceDirectory,
      };
    });
};

/**
 * Zips a directory and returns information about the local archive.
 * @param {string} sourceDirectory
 * @return {!Object<string, *>}
 */
const _zipDirectory = (sourceDirectory, tempFile, options) => {
  const archiveFileStream = fs.createWriteStream(tempFile.name, {
    flags: "w",
    defaultEncoding: "binary",
  });
  const archive = archiver("zip");
  const archiveDone = _pipeAsync(archive, archiveFileStream);
  const allFiles = [];

  return fsAsync
    .readdirRecursive({ path: sourceDirectory, ignore: options.ignore })
    .catch((err) => {
      if (err.code === "ENOENT") {
        return utils.reject(`Could not read directory "${sourceDirectory}"`, { original: err });
      }
      throw err;
    })
    .then(function(files) {
      _.forEach(files, function(file) {
        const name = path.relative(sourceDirectory, file.name);
        allFiles.push(name);
        archive.file(file.name, {
          name,
          mode: file.mode,
        });
      });
      archive.finalize();
      return archiveDone;
    })
    .then(() => {
      const stats = fs.statSync(tempFile.name);
      return {
        file: tempFile.name,
        stream: fs.createReadStream(tempFile.name),
        manifest: allFiles,
        size: stats.size,
        source: sourceDirectory,
      };
    });
};

/**
 * Pipes one stream to another, resolving the returned promise on finish or
 * rejects on an error.
 * @param {!Stream} from
 * @param {!Stream} to
 * @return {!Promise<void>}
 */
const _pipeAsync = function(from, to) {
  return new Promise(function(resolve, reject) {
    to.on("finish", resolve);
    to.on("error", reject);
    from.pipe(to);
  });
};

module.exports = {
  archiveDirectory,
};
