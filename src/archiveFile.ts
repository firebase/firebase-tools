import * as archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

export interface ArchiveOptions {
  /** Optionally override the name of the file being archived */
  archivedFileName?: string;
}

/** Archives (zips) a file and returns a path to the tmp output file. */
export async function archiveFile(filePath: string, options?: ArchiveOptions): Promise<string> {
  const tmpFileObj = tmp.fileSync({ postfix: ".zip" });
  const tmpFile = tmpFileObj.name;
  fs.closeSync(tmpFileObj.fd);
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");
  const name = options?.archivedFileName ?? path.basename(filePath);
  archive.file(filePath, { name });
  await pipeAsync(archive, fileStream);
  return tmpFile;
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
    from.on("error", reject);
    from.pipe(to);
    from.finalize().catch(reject);
  });
}
