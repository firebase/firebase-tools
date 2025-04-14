import * as path from "path";
import * as fs from "fs";
import { addTearDown } from "./test_hooks";

// TODO if we can afford adding a dependency, we could use something like "memfs"
// to mock the file system instead of using the real one.

export type CreateTemporaryDirectoryOptions = {
  parent?: string;
  debugLabel?: string;
};

// Date.now() is not enough to guarantee uniqueness, so we add an incrementing number.
let _increment = 0;

export function createTemporaryDirectory(
  options: CreateTemporaryDirectoryOptions = {}
) {
  const debugLabel = `${
    options.debugLabel || "data-connect-test"
  }-${Date.now()}-${_increment++}`;

  const relativeDir = options.parent
    ? path.join(options.parent, debugLabel)
    : debugLabel;

  const absoluteDir = path.normalize(path.join(process.cwd(), relativeDir));

  fs.mkdirSync(absoluteDir, { recursive: true });
  addTearDown(() => fs.rmSync(absoluteDir, { recursive: true }));

  return absoluteDir;
}

export function createFile(dir: string, name: string, content: string): string;
export function createFile(file: string, content: string): string;
export function createFile(
  ...args: [string, string, string] | [string, string]
) {
  let content: string;
  let filePath: string;
  if (args.length === 2) {
    filePath = args[0];
    content = args[1];
  } else {
    const [dir, name] = args;
    filePath = path.join(dir, name);
    content = args[2];
  }

  fs.writeFileSync(filePath, content);
  // Using "force" in case the file is deleted before tearDown is ran
  addTearDown(() => fs.rmSync(filePath, { force: true }));

  return filePath;
}
