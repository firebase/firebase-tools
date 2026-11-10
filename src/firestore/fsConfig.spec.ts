import { expect } from "chai";
import { FirebaseError } from "../error";
import { FirestoreConfig } from "../firebaseConfig";
import { Options } from "../options";
import { getFirestoreConfig } from "./fsConfig";

const MULTI_DB_CONFIG: FirestoreConfig = [
  { database: "(default)", rules: "firestore.rules", indexes: "firestore.indexes.json" },
  {
    database: "second",
    rules: "firestore.second.rules",
    indexes: "firestore.second.indexes.json",
  },
];

const SINGLE_DB_CONFIG: FirestoreConfig = {
  rules: "firestore.rules",
  indexes: "firestore.indexes.json",
};

function makeOptions(
  only: string | undefined,
  firestore: FirestoreConfig = MULTI_DB_CONFIG,
  targets: Record<string, string[]> = {},
): Options {
  return {
    config: {
      src: {
        firestore,
      },
    },
    rc: {
      requireTarget: (_projectId: string, _type: string, name: string) => {
        if (!targets[name]) {
          throw new FirebaseError(`Deploy target ${name} not configured`);
        }
      },
      target: (_projectId: string, _type: string, name: string) => targets[name] || [],
    },
    only,
  } as unknown as Options;
}

describe("getFirestoreConfig", () => {
  describe("multi-database configuration", () => {
    it("should return all configs with both resources when only is omitted", () => {
      const result = getFirestoreConfig("project", makeOptions(undefined));
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: "firestore.indexes.json" },
        {
          database: "second",
          rules: "firestore.second.rules",
          indexes: "firestore.second.indexes.json",
        },
      ]);
    });

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

    it("should throw with exit 1 when database target is not found in firebase.json", () => {
      try {
        getFirestoreConfig("project", makeOptions("firestore:missing:rules"));
        expect.fail("Expected FirebaseError to be thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(FirebaseError);
        const firebaseErr = err as FirebaseError;
        expect(firebaseErr.message).to.equal(
          "Could not find configurations in firebase.json for the following database targets: missing",
        );
        expect(firebaseErr.exit).to.equal(1);
      }
    });
  });

  describe("target aliases", () => {
    const targetConfig: FirestoreConfig = [
      { database: "(default)", rules: "firestore.rules", indexes: "firestore.indexes.json" },
      { target: "regional", rules: "regional.rules", indexes: "regional.indexes.json" },
    ];
    const rcTargets = { regional: ["us-db", "eu-db"] };

    it("should expand target aliases with only rules when firestore:<target>:rules is specified", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:regional:rules", targetConfig, rcTargets),
      );
      expect(result).to.deep.equal([
        { database: "us-db", rules: "regional.rules", indexes: undefined },
        { database: "eu-db", rules: "regional.rules", indexes: undefined },
      ]);
    });

    it("should expand target aliases with only indexes when firestore:<target>:indexes is specified", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:regional:indexes", targetConfig, rcTargets),
      );
      expect(result).to.deep.equal([
        { database: "us-db", rules: undefined, indexes: "regional.indexes.json" },
        { database: "eu-db", rules: undefined, indexes: "regional.indexes.json" },
      ]);
    });

    it("should combine global and target-scoped resource selections", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:rules,firestore:regional:indexes", targetConfig, rcTargets),
      );
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: undefined },
        { database: "us-db", rules: "regional.rules", indexes: "regional.indexes.json" },
        { database: "eu-db", rules: "regional.rules", indexes: "regional.indexes.json" },
      ]);
    });
  });

  describe("single-database configuration", () => {
    it("should default databaseId to (default) and return both resources when only is omitted", () => {
      const result = getFirestoreConfig("project", makeOptions(undefined, SINGLE_DB_CONFIG));
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: "firestore.indexes.json" },
      ]);
    });

    it("should select only rules when firestore:rules is specified", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:rules", SINGLE_DB_CONFIG),
      );
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: undefined },
      ]);
    });

    it("should select only rules when firestore:(default):rules is specified", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:(default):rules", SINGLE_DB_CONFIG),
      );
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: undefined },
      ]);
    });

    it("should select only indexes when firestore:(default):indexes is specified", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:(default):indexes", SINGLE_DB_CONFIG),
      );
      expect(result).to.deep.equal([
        { database: "(default)", rules: undefined, indexes: "firestore.indexes.json" },
      ]);
    });

    it("should combine global and database-scoped resource selections", () => {
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:rules,firestore:(default):indexes", SINGLE_DB_CONFIG),
      );
      expect(result).to.deep.equal([
        { database: "(default)", rules: "firestore.rules", indexes: "firestore.indexes.json" },
      ]);
    });

    it("should support named single-database configurations", () => {
      const namedSingleConfig: FirestoreConfig = {
        database: "named-db",
        rules: "named.rules",
        indexes: "named.indexes.json",
      };
      const result = getFirestoreConfig(
        "project",
        makeOptions("firestore:named-db:indexes", namedSingleConfig),
      );
      expect(result).to.deep.equal([
        { database: "named-db", rules: undefined, indexes: "named.indexes.json" },
      ]);
    });

    it("should throw with exit 1 when database target does not match single-database config", () => {
      try {
        getFirestoreConfig("project", makeOptions("firestore:other-db:rules", SINGLE_DB_CONFIG));
        expect.fail("Expected FirebaseError to be thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(FirebaseError);
        const firebaseErr = err as FirebaseError;
        expect(firebaseErr.message).to.equal(
          "Could not find configurations in firebase.json for the following database targets: other-db",
        );
        expect(firebaseErr.exit).to.equal(1);
      }
    });
  });

  describe("invalid deploy targets", () => {
    for (const invalidTarget of [
      "firestore:",
      "firestore:second:",
      "firestore:second:unknown",
      "firestore:rules:indexes",
      "firestore:second:rules:extra",
    ]) {
      it(`should reject "${invalidTarget}" with actionable remediation and exit 1`, () => {
        try {
          getFirestoreConfig("project", makeOptions(invalidTarget));
          expect.fail(`Expected FirebaseError for ${invalidTarget}`);
        } catch (err) {
          expect(err).to.be.instanceOf(FirebaseError);
          const firebaseErr = err as FirebaseError;
          expect(firebaseErr.message).to.include(
            `Invalid Firestore deploy target: "${invalidTarget}".`,
          );
          expect(firebaseErr.message).to.include(
            'Expected "firestore", "firestore:<databaseId|target>", "firestore:<databaseId|target>:rules", "firestore:<databaseId|target>:indexes", "firestore:rules", or "firestore:indexes".',
          );
          expect(firebaseErr.exit).to.equal(1);
        }
      });
    }
  });
});
