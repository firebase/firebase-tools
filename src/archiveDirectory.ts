import * as archiver from "archiver";
import * as filesize from "filesize";
import * as fs from "fs";
import * as path from "path";
import * as tar from "tar";
import * as tmp from "tmp";

import { FirebaseError } from "./error";
import { listFiles } from "./listFiles";
import { logger } from "./logger";
import { Readable, Writable } from "stream";
import * as fsAsync from "./fsAsync";

export interface ArchiveOptions {
  /** Type of archive to create. */
  type?: "tar" | "zip";
  /** Globs to be ignored. */
  ignore?: string[];
}

export interface ArchiveResult {
  /** File name. */
  file: string;
  /** Read stream of the archive. */
  stream: Readable;
  /** List of all the files in the archive. */
  manifest: string[];
  /** The size of the archive. */
  size: number;
  /** The source directory of the archive. */
  source: string;
}

/**
 * Archives a directory to a temporary file and returns information about the
 * new archive. Defaults to type "tar", and returns a .tar.gz file.
 */
export async function archiveDirectory(
  sourceDirectory: string,
  options: ArchiveOptions = {},
): Promise<ArchiveResult> {
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
    makeArchive = zipDirectory(sourceDirectory, tempFile, options);
  } else {
    makeArchive = tarDirectory(sourceDirectory, tempFile, options);
  }
  try {
    const archive = await makeArchive;
    logger.debug(`Archived ${filesize(archive.size)} in ${sourceDirectory}.`);
    return archive;
  } catch (err: any) {
    if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError("Failed to create archive.", { original: err });
  }
}

/**
 * Archives a directory and returns information about the local archive.
 */
async function tarDirectory(
  sourceDirectory: string,
  tempFile: tmp.FileResult,
  options: ArchiveOptions,
): Promise<ArchiveResult> {
  const allFiles = listFiles(sourceDirectory, options.ignore);

  // `tar` returns a `TypeError` if `allFiles` is empty. Let's check a feww things.
  try {
    fs.statSync(sourceDirectory);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FirebaseError(`Could not read directory "${sourceDirectory}"`);
    }
    throw err;
  }
  if (!allFiles.length) {
    throw new FirebaseError(
      `Cannot create a tar archive with 0 files from directory "${sourceDirectory}"`,
    );
  }

  await tar.create(
    {
      gzip: true,
      file: tempFile.name,
      cwd: sourceDirectory,
      follow: true,
      noDirRecurse: true,
      portable: true,
    },
    allFiles,
  );
  const stats = fs.statSync(tempFile.name);
  return {
    file: tempFile.name,
    stream: fs.createReadStream(tempFile.name),
    manifest: allFiles,
    size: stats.size,
    source: sourceDirectory,
  };
}

/**
 * Zips a directory and returns information about the local archive.
 */
async function zipDirectory(
  sourceDirectory: string,
  tempFile: tmp.FileResult,
  options: ArchiveOptions,
): Promise<ArchiveResult> {
  const archiveFileStream = fs.createWriteStream(tempFile.name, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");
  const archiveDone = pipeAsync(archive, archiveFileStream);
  const allFiles: string[] = [];

  let files: fsAsync.ReaddirRecursiveFile[];
  try {
    files = await fsAsync.readdirRecursive({ path: sourceDirectory, ignore: options.ignore });
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FirebaseError(`Could not read directory "${sourceDirectory}"`, { original: err });
    }
    throw err;
  }
  for (const file of files) {
    const name = path.relative(sourceDirectory, file.name);
    allFiles.push(name);
    archive.file(file.name, {
      name,
      mode: file.mode,
    });
  }
  void archive.finalize();
  await archiveDone;
  const stats = fs.statSync(tempFile.name);
  return {
    file: tempFile.name,
    stream: fs.createReadStream(tempFile.name),
    manifest: allFiles,
    size: stats.size,
    source: sourceDirectory,
  };
}

/**
 * Pipes one stream to another, resolving the returned promise on finish or
 * rejects on an error.
 */
async function pipeAsync(from: Readable, to: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
    from.pipe(to);
  });
}
