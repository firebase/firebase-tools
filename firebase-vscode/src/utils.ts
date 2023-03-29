import { TextEncoder } from "@zxing/text-encoding";
import * as fs from "fs";
import { FirebaseRC } from "../../src/firebaserc";
import { Deferred } from "./deferred";

/** Read JSON file as T */
// export async function readJsonFile<T>(filename: string): Promise<T> {
//   const exists = fs.existsSync(filename);
//   const res = new Deferred<T>();
//   if (exists) {
//     fs.readFile(filename, (err, data) => {
//       if (err) {
//         res.resolve({} as T);
//       } else {
//         res.resolve(JSON.parse(data.toString()) as T);
//       }
//     });
//   } else {
//     res.resolve({} as T);
//   }
//   return res.promise;
// }

// export async function parseFirebaseJSONFile(filename: string) {
//   return readJsonFile<FirebaseJSON>(filename);
// }

// export async function parseFirebaseRCFile(filename: string) {
//   return readJsonFile<FirebaseRC>(filename);
// }

export async function writeFirebaseRCFile(
  filename: string,
  content: FirebaseRC
) {
  const res = new Deferred<void>();
  fs.writeFile(
    filename,
    new TextEncoder().encode(JSON.stringify(content, null, 2)),
    () => res.resolve()
  );
}
