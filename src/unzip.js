"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUnzipTransform = exports.unzip = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib = __importStar(require("zlib"));
const stream_1 = require("stream");
const util_1 = require("util");
const error_1 = require("./error");
const stream_2 = require("stream");
const logger_1 = require("./logger");
const pipelineAsync = (0, util_1.promisify)(stream_2.pipeline);
const readUInt32LE = (buf, offset) => {
    return ((buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0);
};
const findNextDataDescriptor = (data, offset) => {
    const dataDescriptorSignature = 0x08074b50;
    let position = offset;
    while (position < data.length) {
        const potentialDescriptor = data.slice(position, position + 16);
        if (readUInt32LE(potentialDescriptor, 0) === dataDescriptorSignature) {
            logger_1.logger.debug(`[unzip] found data descriptor signature @ ${position}`);
            const compressedSize = readUInt32LE(potentialDescriptor, 8);
            const uncompressedSize = readUInt32LE(potentialDescriptor, 12);
            return [compressedSize, uncompressedSize];
        }
        position++;
    }
    throw new error_1.FirebaseError("Unable to find compressed and uncompressed size of file in ZIP archive.");
};
const extractEntriesFromBuffer = async (data, outputDir) => {
    let position = 0;
    logger_1.logger.debug(`Data is ${data.length}`);
    while (position < data.length) {
        const entryHeader = data.slice(position, position + 30);
        const entry = {};
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
        if (entry.generalPurposeBitFlag === 8 &&
            entry.compressedSize === 0 &&
            entry.uncompressedSize === 0) {
            // If set, entry header won't have compressed or uncompressed size set.
            // Need to look ahead to data descriptor to find them.
            const [compressedSize, uncompressedSize] = findNextDataDescriptor(data, position);
            entry.compressedSize = compressedSize;
            entry.uncompressedSize = uncompressedSize;
            // If we hit this, we also need to skip over the data descriptor to read the next file
            dataDescriptorSize = 16;
        }
        entry.compressedData = data.slice(position + entry.headerSize, position + entry.headerSize + entry.compressedSize);
        logger_1.logger.debug(`[unzip] Entry: ${entry.fileName} (compressed_size=${entry.compressedSize} bytes, uncompressed_size=${entry.uncompressedSize} bytes)`);
        entry.fileName = entry.fileName.replace(/\//g, path.sep);
        const outputFilePath = path.normalize(path.join(outputDir, entry.fileName));
        // Don't allow traversal outside of outputDir
        if (!isChildDir(outputDir, outputFilePath)) {
            throw new error_1.FirebaseError(`ZIP contained an entry for ${outputFilePath},  a path outside of ${outputDir}`);
        }
        logger_1.logger.debug(`[unzip] Processing entry: ${entry.fileName}`);
        if (entry.fileName.endsWith(path.sep)) {
            logger_1.logger.debug(`[unzip] mkdir: ${outputFilePath}`);
            await fs.promises.mkdir(outputFilePath, { recursive: true });
        }
        else {
            const parentDir = outputFilePath.substring(0, outputFilePath.lastIndexOf(path.sep));
            logger_1.logger.debug(`[unzip] else mkdir: ${parentDir}`);
            await fs.promises.mkdir(parentDir, { recursive: true });
            const compressionMethod = entryHeader.readUInt16LE(8);
            if (compressionMethod === 0) {
                // Store (no compression)
                logger_1.logger.debug(`[unzip] Writing file: ${outputFilePath}`);
                await fs.promises.writeFile(outputFilePath, entry.compressedData);
            }
            else if (compressionMethod === 8) {
                // Deflate
                logger_1.logger.debug(`[unzip] deflating: ${outputFilePath}`);
                await pipelineAsync(stream_1.Readable.from(entry.compressedData), zlib.createInflateRaw(), fs.createWriteStream(outputFilePath));
            }
            else {
                throw new error_1.FirebaseError(`Unsupported compression method: ${compressionMethod}`);
            }
        }
        position += entry.headerSize + entry.compressedSize + dataDescriptorSize;
    }
};
function isChildDir(parentDir, potentialChild) {
    try {
        // 1. Resolve and normalize both paths to absolute paths
        const resolvedParent = path.resolve(parentDir);
        const resolvedChild = path.resolve(potentialChild);
        // The child path must start with the parent path and not be the same path.
        return resolvedChild.startsWith(resolvedParent) && resolvedChild !== resolvedParent;
    }
    catch (error) {
        // If either path does not exist, an error will be thrown.
        // In this case, the potential child cannot be a subdirectory.
        return false;
    }
}
const unzip = async (inputPath, outputDir) => {
    const data = await fs.promises.readFile(inputPath);
    await extractEntriesFromBuffer(data, outputDir);
};
exports.unzip = unzip;
class UnzipTransform extends stream_1.Transform {
    constructor(outputDir) {
        super();
        this.outputDir = outputDir;
        this.chunks = [];
    }
    _transform(chunk, _, callback) {
        this.chunks.push(chunk);
        callback();
    }
    async _flush(callback) {
        try {
            await extractEntriesFromBuffer(Buffer.concat(this.chunks), this.outputDir);
            callback();
            this._resolve?.();
        }
        catch (error) {
            const firebaseError = new error_1.FirebaseError("Unable to unzip the target", {
                children: [error],
                original: error instanceof Error ? error : undefined,
            });
            callback(firebaseError);
            this._reject?.(firebaseError);
        }
    }
    async promise() {
        return new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
}
const createUnzipTransform = (outputDir) => {
    return new UnzipTransform(outputDir);
};
exports.createUnzipTransform = createUnzipTransform;
//# sourceMappingURL=unzip.js.map