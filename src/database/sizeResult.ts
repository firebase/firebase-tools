import * as FirebaseError from "../error";

export interface SizeResult {
  bytes: number;
  success: boolean;
  err: FirebaseError;
}

export class RTDBSizeResult implements SizeResult {
  bytes: number;
  success: boolean;
  err: FirebaseError;

  constructor(success: boolean, bytes: number, err?: FirebaseError) {
    this.bytes = bytes;
    this.success = success;
    this.err = err;
  }
}
