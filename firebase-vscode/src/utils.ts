import * as fs from "fs";
import { FirebaseRC } from "../../src/firebaserc";

export async function writeFirebaseRCFile(
  filename: string,
  content: FirebaseRC
) {
  fs.writeFileSync(filename, JSON.stringify(content, null, 2));
}
