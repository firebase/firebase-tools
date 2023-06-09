import * as fs from "fs";
import { FirebaseRC } from "../../src/firebaserc";

// TODO(hsubox76): use `loadRC` and `RC.save` from firebase-tools src/rc.ts
// for RC file operations
export async function writeFirebaseRCFile(
  filename: string,
  content: FirebaseRC
) {
  fs.writeFileSync(filename, JSON.stringify(content, null, 2));
}
