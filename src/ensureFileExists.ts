import * as fs from 'fs-extra';
import {FirebaseError} from './error';

export function ensureFileExists(file: string, message = ""): void {
  if (!fs.existsSync(file)) {
    throw new FirebaseError(`File ${file} does not exist: ${message}`);
  }
}