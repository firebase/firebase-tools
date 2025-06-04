import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { Readable, Transform, TransformCallback } from "stream";
import { promisify } from "util";
import { FirebaseError } from "./error";
import { pipeline } from "stream";
import { logger } from "./logger";

const pipelineAsync = promisify(pipeline);

interface ZipEntry {
  generalPurposeBitFlag: number;
  compressedSize: number;
  uncompressedSize: number;
  fileNameLength: number;
  extraLength: number;
  fileName: string;
  headerSize: number;
  compressedData: Buffer;
}

const readUInt32LE = (buf: Buffer, offset: number): number => {
  return (
    (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0
  );
};

const findNextDataDescriptor = (data: Buffer, offset: number): [number, number] => {
  const dataDescriptorSignature = 0x08074b50;
  let position = offset;
  while (position < data.length) {
    const potentialDescriptor = data.slice(position, position + 16);
    if (readUInt32LE(potentialDescriptor, 0) === dataDescriptorSignature) {
      logger.debug(`[unzip] found data descriptor signature @ ${position}`);
      const compressedSize = readUInt32LE(potentialDescriptor, 8);
      const uncompressedSize = readUInt32LE(potentialDescriptor, 12);
      return [compressedSize, uncompressedSize];
    }
    position++;
  }
  throw new FirebaseError(
    "Unable to find compressed and uncompressed size of file in ZIP archive.",
  );
};

const extractEntriesFromBuffer = async (data: Buffer, outputDir: string): Promise<void> => {
  let position = 0;
  logger.debug(`Data is ${data.length}`);
  while (position < data.length) {
    const entryHeader = data.slice(position, position + 30);
    const entry: ZipEntry = {} as ZipEntry;
    if (readUInt32LE(entryHeader, 0) !== 0x04034b50) {
      break;
    }
    entry.generalPurposeBitFlag = entryHeader.readUint16LE(6);
    entry.compressedSize = readUInt32LE(entryHeader, 18);
    entry.uncompressedSize = readUInt32LE(entryHeader, 22);
    entry.fileNameLength = entryHeader.readUInt16LE(26);
    entry.extraLength = entryHeader.readUInt16LE(28);
    entry.fileName = data.toString("utf-8", position + 30, position + 30 + entry.fileNameLength);
    entry.headerSize = 30 + entry.fileNameLength + entry.extraLength;
    let dataDescriptorSize = 0;
    if (
      entry.generalPurposeBitFlag === 8 &&
      entry.compressedSize === 0 &&
      entry.uncompressedSize === 0
    ) {
      // If set, entry header won't have compressed or uncompressed size set.
      // Need to look ahead to data descriptor to find them.
      const [compressedSize, uncompressedSize] = findNextDataDescriptor(data, position);
      entry.compressedSize = compressedSize;
      entry.uncompressedSize = uncompressedSize;
      // If we hit this, we also need to skip over the data descriptor to read the next file
      dataDescriptorSize = 16;
    }
    entry.compressedData = data.slice(
      position + entry.headerSize,
      position + entry.headerSize + entry.compressedSize,
    );
    logger.debug(
      `[unzip] Entry: ${entry.fileName} (compressed_size=${entry.compressedSize} bytes, uncompressed_size=${entry.uncompressedSize} bytes)`,
    );

    entry.fileName = entry.fileName.replace(/\//g, path.sep);

    const outputFilePath = path.normalize(path.join(outputDir, entry.fileName));

    logger.debug(`[unzip] Processing entry: ${entry.fileName}`);
    if (entry.fileName.endsWith(path.sep)) {
      logger.debug(`[unzip] mkdir: ${outputFilePath}`);
      await fs.promises.mkdir(outputFilePath, { recursive: true });
    } else {
      const parentDir = outputFilePath.substring(0, outputFilePath.lastIndexOf(path.sep));
      logger.debug(`[unzip] else mkdir: ${parentDir}`);
      await fs.promises.mkdir(parentDir, { recursive: true });

      const compressionMethod = entryHeader.readUInt16LE(8);
      if (compressionMethod === 0) {
        // Store (no compression)
        logger.debug(`[unzip] Writing file: ${outputFilePath}`);
        await fs.promises.writeFile(outputFilePath, entry.compressedData);
      } else if (compressionMethod === 8) {
        // Deflate
        logger.debug(`[unzip] deflating: ${outputFilePath}`);
        await pipelineAsync(
          Readable.from(entry.compressedData),
          zlib.createInflateRaw(),
          fs.createWriteStream(outputFilePath),
        );
      } else {
        throw new FirebaseError(`Unsupported compression method: ${compressionMethod}`);
      }
    }

    position += entry.headerSize + entry.compressedSize + dataDescriptorSize;
  }
};

export const unzip = async (inputPath: string, outputDir: string): Promise<void> => {
  const data = await fs.promises.readFile(inputPath);
  await extractEntriesFromBuffer(data, outputDir);
};

class UnzipTransform extends Transform {
  private chunks: Buffer[] = [];
  private _resolve?: () => unknown;
  private _reject?: (e: Error) => unknown;

  constructor(private outputDir: string) {
    super();
  }

  _transform(chunk: Buffer, _: unknown, callback: TransformCallback): void {
    this.chunks.push(chunk);
    callback();
  }

  async _flush(callback: TransformCallback): Promise<void> {
    try {
      await extractEntriesFromBuffer(Buffer.concat(this.chunks), this.outputDir);
      callback();
      this._resolve?.();
    } catch (error) {
      const firebaseError = new FirebaseError("Unable to unzip the target", {
        children: [error],
        original: error instanceof Error ? error : undefined,
      });
      callback(firebaseError);
      this._reject?.(firebaseError);
    }
  }

  async promise(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
}

export const createUnzipTransform = (outputDir: string): UnzipTransform => {
  return new UnzipTransform(outputDir);
};
