import { expect } from "chai";
import { FirestoreIndexes } from "../../firestore/indexes";
import * as FirebaseError from "../../error";
import * as API from "../../firestore/indexes-api";
import * as Spec from "../../firestore/indexes-spec";

const idx = new FirestoreIndexes();

const VALID_SPEC = {
  indexes: [
    {
      collectionGroup: "collection",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "foo", order: "ASCENDING" },
        { fieldPath: "bar", order: "DESCENDING" },
        { fieldPath: "baz", arrayConfig: "CONTAINS" },
      ],
    },
  ],
  fieldOverrides: [
    {
      collectionGroup: "collection",
      fieldPath: "foo",
      indexes: [
        { order: "ASCENDING", scope: "COLLECTION" },
        { arrayConfig: "CONTAINS", scope: "COLLECTION" },
      ],
    },
  ],
};

describe("IndexValidation", () => {
  it("should accept a valid v1beta2 index spec", () => {
    idx.validateSpec(VALID_SPEC);
  });

  it("should not change a valid v1beta2 index spec after upgrade", () => {
    const upgraded = idx.upgradeOldSpec(VALID_SPEC);
    expect(upgraded).to.eql(VALID_SPEC);
  });

  it("should accept an empty spec", () => {
    const empty = {
      indexes: [],
    };

    idx.validateSpec(idx.upgradeOldSpec(empty));
  });

  it("should accept a valid v1beta1 index spec after upgrade", () => {
    idx.validateSpec(
      idx.upgradeOldSpec({
        indexes: [
          {
            collectionId: "collection",
            fields: [
              { fieldPath: "foo", mode: "ASCENDING" },
              { fieldPath: "bar", mode: "DESCENDING" },
              { fieldPath: "baz", mode: "ARRAY_CONTAINS" },
            ],
          },
        ],
      })
    );
  });

  it("should reject an incomplete index spec", () => {
    expect(() => {
      idx.validateSpec({
        indexes: [
          {
            collectionGroup: "collection",
            fields: [
              { fieldPath: "foo", order: "ASCENDING" },
              { fieldPath: "bar", order: "DESCENDING" },
            ],
          },
        ],
      });
    }).to.throw(FirebaseError, /Must contain "queryScope"/);
  });

  it("should reject an overspecified index spec", () => {
    expect(() => {
      idx.validateSpec({
        indexes: [
          {
            collectionGroup: "collection",
            queryScope: "COLLECTION",
            fields: [
              { fieldPath: "foo", order: "ASCENDING", arrayConfig: "CONTAINES" },
              { fieldPath: "bar", order: "DESCENDING" },
            ],
          },
        ],
      });
    }).to.throw(FirebaseError, /Must contain exactly one of "order,arrayConfig"/);
  });
});

describe("IndexNameParsing", () => {
  it("should parse an index name correctly", () => {
    const name =
      "/projects/myproject/databases/(default)/collectionGroups/collection/indexes/abc123/";
    expect(idx.parseIndexName(name)).to.eql({
      projectId: "myproject",
      collectionGroupId: "collection",
      indexId: "abc123",
    });
  });

  it("should parse a field name correctly", () => {
    const name =
      "/projects/myproject/databases/(default)/collectionGroups/collection/fields/abc123/";
    expect(idx.parseFieldName(name)).to.eql({
      projectId: "myproject",
      collectionGroupId: "collection",
      fieldPath: "abc123",
    });
  });
});

describe("IndexSpecMatching", () => {
  it("should identify a positive index spec match", () => {
    const apiIndex: API.Index = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/indexes/abc123",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        { fieldPath: "foo", order: API.Order.ASCENDING },
        { fieldPath: "bar", arrayConfig: API.ArrayConfig.CONTAINS },
      ],
      state: API.State.READY,
    };

    const specIndex = {
      collectionGroup: "collection",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "foo", order: "ASCENDING" },
        { fieldPath: "bar", arrayConfig: "CONTAINS" },
      ],
    } as Spec.Index;

    expect(idx.indexMatchesSpec(apiIndex, specIndex)).to.eql(true);
  });

  it("should identify a negative index spec match", () => {
    const apiIndex = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/indexes/abc123",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "foo", order: "DESCENDING" },
        { fieldPath: "bar", arrayConfig: "CONTAINS" },
      ],
      state: API.State.READY,
    } as API.Index;

    const specIndex = {
      collectionGroup: "collection",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "foo", order: "ASCENDING" },
        { fieldPath: "bar", arrayConfig: "CONTAINS" },
      ],
    } as Spec.Index;

    // The second spec contains ASCENDING where the former contains DESCENDING
    expect(idx.indexMatchesSpec(apiIndex, specIndex)).to.eql(false);
  });

  it("should identify a positive field spec match", () => {
    const apiField = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/fields/abc123",
      indexConfig: {
        indexes: [
          {
            queryScope: "COLLECTION",
            fields: [{ fieldPath: "abc123", order: "ASCENDING" }],
          },
          {
            queryScope: "COLLECTION",
            fields: [{ fieldPath: "abc123", arrayConfig: "CONTAINS" }],
          },
        ],
      },
    } as API.Field;

    const specField = {
      collectionGroup: "collection",
      fieldPath: "abc123",
      indexes: [
        { order: "ASCENDING", queryScope: "COLLECTION" },
        { arrayConfig: "CONTAINS", queryScope: "COLLECTION" },
      ],
    } as Spec.FieldOverride;

    expect(idx.fieldMatchesSpec(apiField, specField)).to.eql(true);
  });

  it("should match a field spec with all indexes excluded", () => {
    const apiField = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/fields/abc123",
      indexConfig: {},
    } as API.Field;

    const specField = {
      collectionGroup: "collection",
      fieldPath: "abc123",
      indexes: [],
    } as Spec.FieldOverride;

    expect(idx.fieldMatchesSpec(apiField, specField)).to.eql(true);
  });

  it("should identify a negative field spec match", () => {
    const apiField = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/fields/abc123",
      indexConfig: {
        indexes: [
          {
            queryScope: "COLLECTION",
            fields: [{ fieldPath: "abc123", order: "ASCENDING" }],
          },
          {
            queryScope: "COLLECTION",
            fields: [{ fieldPath: "abc123", arrayConfig: "CONTAINS" }],
          },
        ],
      },
    } as API.Field;

    const specField = {
      collectionGroup: "collection",
      fieldPath: "abc123",
      indexes: [
        { order: "DESCENDING", queryScope: "COLLECTION" },
        { arrayConfig: "CONTAINS", queryScope: "COLLECTION" },
      ],
    } as Spec.FieldOverride;

    // The second spec contains "DESCENDING" where the first contains "ASCENDING"
    expect(idx.fieldMatchesSpec(apiField, specField)).to.eql(false);
  });
});
