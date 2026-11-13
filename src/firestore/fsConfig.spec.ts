import { expect } from "chai";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { getFirestoreConfig } from "./fsConfig";

function makeOptions(only: string): Options {
  return {
    config: {
      src: {
        firestore: [
          { database: "(default)", rules: "firestore.rules", indexes: "firestore.indexes.json" },
          {
            database: "second",
            rules: "firestore.second.rules",
            indexes: "firestore.second.indexes.json",
          },
        ],
      },
    },
    rc: {
      requireTarget: () => undefined,
      target: () => [],
    },
    only,
  } as unknown as Options;
}

describe("getFirestoreConfig", () => {
  it("should return all configs with only indexes when firestore:indexes is specified", () => {
    const result = getFirestoreConfig("project", makeOptions("firestore:indexes"));
    expect(result).to.have.length(2);
    expect(result.map((config) => config.indexes)).to.deep.equal([
      "firestore.indexes.json",
      "firestore.second.indexes.json",
    ]);
    expect(result.every((config) => config.rules === undefined)).to.be.true;
  });

  it("should return all configs with only rules when firestore:rules is specified", () => {
    const result = getFirestoreConfig("project", makeOptions("firestore:rules"));
    expect(result).to.have.length(2);
    expect(result.map((config) => config.rules)).to.deep.equal([
      "firestore.rules",
      "firestore.second.rules",
    ]);
    expect(result.every((config) => config.indexes === undefined)).to.be.true;
  });

  it("should return both resources for a database-scoped target", () => {
    const result = getFirestoreConfig("project", makeOptions("firestore:second"));
    expect(result).to.deep.equal([
      {
        database: "second",
        rules: "firestore.second.rules",
        indexes: "firestore.second.indexes.json",
      },
    ]);
  });

  it("should select only rules for a database-scoped target", () => {
    const result = getFirestoreConfig("project", makeOptions("firestore:second:rules"));
    expect(result).to.deep.equal([
      { database: "second", rules: "firestore.second.rules", indexes: undefined },
    ]);
  });

  it("should select only indexes for a database-scoped target", () => {
    const result = getFirestoreConfig("project", makeOptions("firestore:second:indexes"));
    expect(result).to.deep.equal([
      { database: "second", rules: undefined, indexes: "firestore.second.indexes.json" },
    ]);
  });

  it("should combine global and database-scoped resource selections", () => {
    const result = getFirestoreConfig(
      "project",
      makeOptions("firestore:rules,firestore:second:indexes"),
    );
    expect(result).to.deep.equal([
      { database: "(default)", rules: "firestore.rules", indexes: undefined },
      {
        database: "second",
        rules: "firestore.second.rules",
        indexes: "firestore.second.indexes.json",
      },
    ]);
  });

  it("should reject unsupported database-scoped resources", () => {
    expect(() => getFirestoreConfig("project", makeOptions("firestore:second:unknown"))).to.throw(
      FirebaseError,
      "Invalid Firestore deploy target: firestore:second:unknown",
    );
  });
});
