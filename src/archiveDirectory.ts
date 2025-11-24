import * as archiver from "archiver";
import * as filesize from "filesize";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

import { FirebaseError, getError } from "./error";
import { logger } from "./logger";
import { Readable, Writable } from "stream";
import * as fsAsync from "./fsAsync";

export interface ArchiveOptions {
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
 * new archive.
 */
export async function archiveDirectory(
  sourceDirectory: string,
  options: ArchiveOptions = {},
): Promise<ArchiveResult> {
  const postfix = ".zip";
  const tempFile = tmp.fileSync({
    prefix: "firebase-archive-",
    postfix,
  });

  if (!options.ignore) {
    options.ignore = [];
  }

  const makeArchive = zipDirectory(sourceDirectory, tempFile, options);
  try {
    const archive = await makeArchive;
    logger.debug(`Archived ${filesize(archive.size)} in ${sourceDirectory}.`);
    return archive;
  } catch (err: unknown) {
    if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError("Failed to create archive.", { original: getError(err) });
  }
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
  // For security, filter out all symlinks. This code is a bit obtuse to preserve ordering.
  const realFiles = (
    await Promise.all(
      files.map(async (f) => {
        const stats = await fs.promises.lstat(f.name);
        return stats.isSymbolicLink() ? null : f;
      }),
    )
  ).filter((fileOrNull): fileOrNull is (typeof files)[number] => fileOrNull !== null);

  for (const file of realFiles) {
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
