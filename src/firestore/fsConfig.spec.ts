import { expect } from "chai";
import { getFirestoreConfig } from "./fsConfig";

describe("getFirestoreConfig", () => {
  it("should return all configs when firestore:indexes is specified in only", () => {
    const options: any = {
      config: {
        src: {
          firestore: [
            { database: "(default)", rules: "firestore.rules" },
            { database: "second", rules: "firestore.second.rules" },
          ],
        },
      },
      rc: {
        requireTarget: () => {
          return;
        },
        target: () => [],
      },
      only: "firestore:indexes",
    };

    const result = getFirestoreConfig("project", options);
    expect(result).to.have.length(2);
  });

  it("should return all configs when firestore:rules is specified in only", () => {
    const options: any = {
      config: {
        src: {
          firestore: [
            { database: "(default)", rules: "firestore.rules" },
            { database: "second", rules: "firestore.second.rules" },
          ],
        },
      },
      rc: {
        requireTarget: () => {
          return;
        },
        target: () => [],
      },
      only: "firestore:rules",
    };

    const result = getFirestoreConfig("project", options);
    expect(result).to.have.length(2);
  });
});
