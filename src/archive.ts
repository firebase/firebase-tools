import * as fs from "fs";
import * as path from "path";
import { pipeline, Writable } from "stream";
import * as tarStream from "tar-stream";
import * as yazl from "yazl";
import * as zlib from "zlib";

export type ArchiveFormat = "zip" | "tar.gz";

export interface ArchiveEntryOptions {
  /** Entry path inside the archive (forward-slash normalized). */
  name: string;
  /** Optional POSIX file permissions / mode bits (e.g. `0o755` or `fs.Stats.mode`). */
  mode?: number;
}

export interface ArchiveWriter {
  /** Adds a file from disk to the archive. */
  file(filePath: string, options: ArchiveEntryOptions): void;
  /** Adds an in-memory buffer or string entry to the archive. */
  append(content: Buffer | string, options: ArchiveEntryOptions): void;
  /** Streams all entries to the destination and resolves once writing finishes. */
  finalize(): Promise<void>;
}

function normalizeEntryName(name: string): string {
  return name.split(path.sep).join("/").replace(/\\/g, "/").replace(/^\/+/, "");
}

function toZipFileMode(mode?: number): number | undefined {
  if (mode === undefined) {
    return undefined;
  }
  return fs.constants.S_IFREG | (mode & 0o7777);
}

function toTarMode(mode?: number): number | undefined {
  if (mode === undefined) {
    return undefined;
  }
  return mode & 0o7777;
}

class ZipArchiveWriter implements ArchiveWriter {
  private readonly zipfile = new yazl.ZipFile();
  private pendingError?: Error;
  private onError?: (err: Error) => void;

  constructor(private readonly output: Writable) {
    const handleZipError = (err: unknown): void => {
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.onError) {
        this.onError(error);
      } else if (!this.pendingError) {
        this.pendingError = error;
      }
    };
    // yazl emits fs.stat / read errors on ZipFile itself, potentially before finalize() is called.
    (this.zipfile as unknown as NodeJS.EventEmitter).on("error", handleZipError);
    this.zipfile.outputStream.on("error", handleZipError);
  }

  file(filePath: string, options: ArchiveEntryOptions): void {
    const metadataPath = normalizeEntryName(options.name);
    const mode = toZipFileMode(options.mode);
    this.zipfile.addFile(filePath, metadataPath, mode !== undefined ? { mode } : undefined);
  }

  append(content: Buffer | string, options: ArchiveEntryOptions): void {
    const metadataPath = normalizeEntryName(options.name);
    const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const mode = toZipFileMode(options.mode);
    this.zipfile.addBuffer(buffer, metadataPath, mode !== undefined ? { mode } : undefined);
  }

  finalize(): Promise<void> {
    if (this.pendingError) {
      this.output.destroy();
      return Promise.reject(this.pendingError);
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.zipfile.outputStream.unpipe(this.output);
        this.output.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      this.onError = fail;
      this.output.once("error", fail);
      this.output.once("finish", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      this.zipfile.outputStream.pipe(this.output);
      this.zipfile.end();
    });
  }
}

type TarQueuedEntry =
  | { kind: "file"; filePath: string; options: ArchiveEntryOptions }
  | { kind: "buffer"; content: Buffer; options: ArchiveEntryOptions };

class TarGzArchiveWriter implements ArchiveWriter {
  private readonly entries: TarQueuedEntry[] = [];

  constructor(private readonly output: Writable) {}

  file(filePath: string, options: ArchiveEntryOptions): void {
    this.entries.push({ kind: "file", filePath, options });
  }

  append(content: Buffer | string, options: ArchiveEntryOptions): void {
    const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    this.entries.push({ kind: "buffer", content: buffer, options });
  }

  async finalize(): Promise<void> {
    const pack = tarStream.pack();
    const gzip = zlib.createGzip();

    let settled = false;
    let rejectPipeline: (err: Error) => void = () => undefined;
    const pipelineDone = new Promise<void>((resolve, reject) => {
      rejectPipeline = reject;
      const fail = (err: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        pack.destroy();
        gzip.destroy();
        this.output.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      pack.once("error", fail);
      gzip.once("error", fail);
      this.output.once("error", fail);
      this.output.once("finish", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      pack.pipe(gzip).pipe(this.output);
    });

    try {
      for (const entry of this.entries) {
        const name = normalizeEntryName(entry.options.name);
        if (entry.kind === "buffer") {
          await new Promise<void>((resolve, reject) => {
            pack.entry(
              {
                name,
                mode: toTarMode(entry.options.mode),
                size: entry.content.length,
              },
              entry.content,
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              },
            );
          });
        } else {
          const stat = await fs.promises.stat(entry.filePath);
          await new Promise<void>((resolve, reject) => {
            let entrySettled = false;
            const done = (err?: Error | null): void => {
              if (entrySettled) {
                return;
              }
              entrySettled = true;
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            };
            const entryStream = pack.entry(
              {
                name,
                mode: toTarMode(entry.options.mode ?? stat.mode),
                size: stat.size,
                mtime: stat.mtime,
              },
              done,
            );
            const reader = fs.createReadStream(entry.filePath);
            pipeline(reader, entryStream, (err) => {
              if (err) {
                done(err);
              }
            });
          });
        }
      }
      pack.finalize();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!settled) {
        settled = true;
        pack.destroy();
        gzip.destroy();
        this.output.destroy();
        rejectPipeline(error);
      }
    }

    await pipelineDone;
  }
}

/**
 * Creates a streaming archive writer targeting `output` in either `zip` or `tar.gz` format.
 */
export function createArchive(format: ArchiveFormat, output: Writable): ArchiveWriter {
  return format === "tar.gz" ? new TarGzArchiveWriter(output) : new ZipArchiveWriter(output);
}
