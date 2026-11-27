import { expect } from "chai";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { getFirestoreConfig } from "./fsConfig";

function makeOptions(only: string, firestore: unknown): Options {
  return {
    config: {
      src: {
        firestore: firestore as Options["config"]["src"]["firestore"],
      },
    },
    rc: {
      requireTarget: () => undefined,
      target: () => [],
    },
    only,
  } as unknown as Options;
}

const multiDatabase = [
  { database: "(default)", rules: "firestore.rules", indexes: "firestore.indexes.json" },
  {
    database: "second",
    rules: "firestore.second.rules",
    indexes: "firestore.second.indexes.json",
  },
];

const singleDatabase = {
  rules: "firestore.rules",
  indexes: "firestore.indexes.json",
};

describe("getFirestoreConfig", () => {
  describe("multi-database configs", () => {
    it("should return all configs with only indexes when firestore:indexes is specified", () => {
      const result = getFirestoreConfig("project", makeOptions("firestore:indexes", multiDatabase));
      expect(result).to.have.length(2);
      expect(result.map((config) => config.indexes)).to.deep.equal([
        "firestore.indexes.json",
        "firestore.second.indexes.json",
      ]);
      expect(result.every((config) => config.rules === undefined)).to.be.true;
    });

    it("should return all configs with only rules when firestore:rules is specified", () => {
      const result = getFirestoreConfig("project", makeOptions("firestore:rules", multiDatabase));
      expect(result).to.have.length(2);
      expect(result.map((config) => config.rules)).to.deep.equal([
        "firestore.rules",
        "firestore.second.rules",
      ]);
      expect(result.every((config) => config.indexes === undefined)).to.be.true;
    });

    it("should return both resources for a database-scoped target", () => {
      const result = getFirestoreConfig("project", makeOptions("firestore:second", multiDatabase));
      expect(result).to.deep.equal([
        {
          database: "second",
          rules: "firestore.second.rules",
          indexes: "firestore.second.indexes.json",
        },
      ]);
    });

    it("should select only rules for a database-scoped target", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:second:rules", multiDatabase),
      );
      expect(result).to.deep.equal([
        { database: "second", rules: "firestore.second.rules", indexes: undefined },
      ]);
    });

    it("should select only indexes for a database-scoped target", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:second:indexes", multiDatabase),
      );
      expect(result).to.deep.equal([
        { database: "second", rules: undefined, indexes: "firestore.second.indexes.json" },
      ]);
    });

    it("should combine global and database-scoped resource selections", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:rules,firestore:second:indexes", multiDatabase),
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
      expect(() =>
        getFirestoreConfig("project", makeOptions("firestore:second:unknown", multiDatabase)),
      ).to.throw(FirebaseError, 'Invalid Firestore deploy target: "firestore:second:unknown"');
    });

    it("should explain the accepted target formats and fail with exit status 1", () => {
      let error: FirebaseError | undefined;
      try {
        getFirestoreConfig("project", makeOptions("firestore:second:unknown", multiDatabase));
      } catch (e: unknown) {
        error = e as FirebaseError;
      }
      expect(error).to.be.instanceOf(FirebaseError);
      expect(error?.exit).to.equal(1);
      expect(error?.message).to.include("firestore:<databaseId|target>:rules");
      expect(error?.message).to.include("firestore:<databaseId|target>:indexes");
    });

    it("should reject a database target that is not in firebase.json", () => {
      expect(() =>
        getFirestoreConfig("project", makeOptions("firestore:missing", multiDatabase)),
      ).to.throw(
        FirebaseError,
        "Could not find configurations in firebase.json for the following database targets: missing",
      );
    });

    it("should set exit status 1 when a database target is not in firebase.json", () => {
      let error: FirebaseError | undefined;
      try {
        getFirestoreConfig("project", makeOptions("firestore:missing", multiDatabase));
      } catch (e: unknown) {
        error = e as FirebaseError;
      }
      expect(error).to.be.instanceOf(FirebaseError);
      expect(error?.exit).to.equal(1);
    });

    it("should resolve a target alias to the databases it maps to", () => {
      const aliased = [
        { target: "alias", rules: "firestore.rules", indexes: "firestore.indexes.json" },
      ];
      const options = makeOptions("firestore:alias:indexes", aliased);
      options.rc = {
        requireTarget: () => ["aliased"],
        target: () => ["aliased"],
      } as unknown as Options["rc"];
      const result = getFirestoreConfig("project", options);
      expect(result).to.deep.equal([
        { database: "aliased", rules: undefined, indexes: "firestore.indexes.json" },
      ]);
    });
  });

  describe("single-database configs", () => {
    it("should select only rules with the global firestore:rules selector", () => {
      const result = getFirestoreConfig("project", makeOptions("firestore:rules", singleDatabase));
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: undefined },
      ]);
    });

    it("should select only indexes with the global firestore:indexes selector", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:indexes", singleDatabase),
      );
      expect(result).to.deep.equal([
        { database: "(default)", rules: undefined, indexes: "firestore.indexes.json" },
      ]);
    });

    it("should select only rules for the default database by name", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:(default):rules", singleDatabase),
      );
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: undefined },
      ]);
    });

    it("should merge global and database-scoped selections for the same database", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:rules,firestore:(default):indexes", singleDatabase),
      );
      expect(result).to.deep.equal([
        {
          database: "(default)",
          rules: "firestore.rules",
          indexes: "firestore.indexes.json",
        },
      ]);
    });

    it("should select both resources when only the bare firestore target is given", () => {
      const result = getFirestoreConfig("project", makeOptions("firestore", singleDatabase));
      expect(result).to.deep.equal([
        {
          database: "(default)",
          rules: "firestore.rules",
          indexes: "firestore.indexes.json",
        },
      ]);
    });

    it("should honor the configured database name", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:named:indexes", { database: "named", ...singleDatabase }),
      );
      expect(result).to.deep.equal([
        { database: "named", rules: undefined, indexes: "firestore.indexes.json" },
      ]);
    });

    it("should reject a database target that does not match the configured database", () => {
      expect(() =>
        getFirestoreConfig("project", makeOptions("firestore:second:rules", singleDatabase)),
      ).to.throw(
        FirebaseError,
        "Could not find configurations in firebase.json for the following database targets: second",
      );
    });

    it("should set exit status 1 instead of silently deploying nothing", () => {
      let error: FirebaseError | undefined;
      try {
        getFirestoreConfig("project", makeOptions("firestore:second:rules", singleDatabase));
      } catch (e: unknown) {
        error = e as FirebaseError;
      }
      expect(error).to.be.instanceOf(FirebaseError);
      expect(error?.exit).to.equal(1);
    });

    it("should reject unsupported database-scoped resources", () => {
      expect(() =>
        getFirestoreConfig("project", makeOptions("firestore:(default):unknown", singleDatabase)),
      ).to.throw(FirebaseError, 'Invalid Firestore deploy target: "firestore:(default):unknown"');
    });

    it("should reject an empty resource suffix", () => {
      expect(() =>
        getFirestoreConfig("project", makeOptions("firestore:(default):", singleDatabase)),
      ).to.throw(FirebaseError, "Invalid Firestore deploy target");
    });

    it("should select nothing when --only names no firestore target", () => {
      const result = getFirestoreConfig("project", makeOptions("functions", singleDatabase));
      expect(result).to.deep.equal([]);
    });
  });
});
