import { expect } from "chai";
import { FirestoreApi } from "../../firestore/api";
import { FirebaseError } from "../../error";
import * as API from "../../firestore/api-types";
import * as Spec from "../../firestore/api-spec";
import * as sort from "../../firestore/api-sort";

const idx = new FirestoreApi();

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
      }),
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

  it("should identify a positive field spec match with ttl specified as false", () => {
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
      ttl: false,
      indexes: [
        { order: "ASCENDING", queryScope: "COLLECTION" },
        { arrayConfig: "CONTAINS", queryScope: "COLLECTION" },
      ],
    } as Spec.FieldOverride;

    expect(idx.fieldMatchesSpec(apiField, specField)).to.eql(true);
  });

  it("should identify a positive ttl field spec match", () => {
    const apiField = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/fields/fieldTtl",
      indexConfig: {
        indexes: [
          {
            queryScope: "COLLECTION",
            fields: [{ fieldPath: "fieldTtl", order: "ASCENDING" }],
          },
        ],
      },
      ttlConfig: {
        state: "ACTIVE",
      },
    } as API.Field;

    const specField = {
      collectionGroup: "collection",
      fieldPath: "fieldTtl",
      ttl: true,
      indexes: [{ order: "ASCENDING", queryScope: "COLLECTION" }],
    } as Spec.FieldOverride;

    expect(idx.fieldMatchesSpec(apiField, specField)).to.eql(true);
  });

  it("should identify a negative ttl field spec match", () => {
    const apiField = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/fields/fieldTtl",
      indexConfig: {
        indexes: [
          {
            queryScope: "COLLECTION",
            fields: [{ fieldPath: "fieldTtl", order: "ASCENDING" }],
          },
        ],
      },
    } as API.Field;

    const specField = {
      collectionGroup: "collection",
      fieldPath: "fieldTtl",
      ttl: true,
      indexes: [{ order: "ASCENDING", queryScope: "COLLECTION" }],
    } as Spec.FieldOverride;

    expect(idx.fieldMatchesSpec(apiField, specField)).to.eql(false);
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

  it("should match a field spec with only ttl", () => {
    const apiField = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/fields/ttlField",
      ttlConfig: {
        state: "ACTIVE",
      },
      indexConfig: {},
    } as API.Field;

    const specField = {
      collectionGroup: "collection",
      fieldPath: "ttlField",
      ttl: true,
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

  it("should identify a negative field spec match with ttl as false", () => {
    const apiField = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collection/fields/fieldTtl",
      ttlConfig: {
        state: "ACTIVE",
      },
      indexConfig: {},
    } as API.Field;

    const specField = {
      collectionGroup: "collection",
      fieldPath: "fieldTtl",
      ttl: false,
      indexes: [],
    } as Spec.FieldOverride;

    // The second spec contains "false" for ttl  where the first contains "true"
    // for ttl
    expect(idx.fieldMatchesSpec(apiField, specField)).to.eql(false);
  });
});

describe("IndexSorting", () => {
  it("should be able to handle empty arrays", () => {
    expect(([] as Spec.Index[]).sort(sort.compareSpecIndex)).to.eql([]);
    expect(([] as Spec.FieldOverride[]).sort(sort.compareFieldOverride)).to.eql([]);
    expect(([] as API.Index[]).sort(sort.compareApiIndex)).to.eql([]);
    expect(([] as API.Field[]).sort(sort.compareApiField)).to.eql([]);
  });

  it("should correctly sort an array of Spec indexes", () => {
    // Sorts first because of collectionGroup
    const a: Spec.Index = {
      collectionGroup: "collectionA",
      queryScope: API.QueryScope.COLLECTION,
      fields: [],
    };

    // fieldA ASCENDING should sort before fieldA DESCENDING
    const b: Spec.Index = {
      collectionGroup: "collectionB",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        {
          fieldPath: "fieldA",
          order: API.Order.ASCENDING,
        },
      ],
    };

    // This compound index sorts before the following simple
    // index because the first element sorts first.
    const c: Spec.Index = {
      collectionGroup: "collectionB",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        {
          fieldPath: "fieldA",
          order: API.Order.ASCENDING,
        },
        {
          fieldPath: "fieldB",
          order: API.Order.ASCENDING,
        },
      ],
    };

    const d: Spec.Index = {
      collectionGroup: "collectionB",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        {
          fieldPath: "fieldB",
          order: API.Order.ASCENDING,
        },
      ],
    };

    const e: Spec.Index = {
      collectionGroup: "collectionB",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        {
          fieldPath: "fieldB",
          order: API.Order.ASCENDING,
        },
        {
          fieldPath: "fieldA",
          order: API.Order.ASCENDING,
        },
      ],
    };

    expect([b, a, e, d, c].sort(sort.compareSpecIndex)).to.eql([a, b, c, d, e]);
  });

  it("should correcty sort an array of Spec field overrides", () => {
    // Sorts first because of collectionGroup
    const a: Spec.FieldOverride = {
      collectionGroup: "collectionA",
      fieldPath: "fieldA",
      indexes: [],
    };

    const b: Spec.FieldOverride = {
      collectionGroup: "collectionB",
      fieldPath: "fieldA",
      indexes: [],
    };

    // Order indexes sort before Array indexes
    const c: Spec.FieldOverride = {
      collectionGroup: "collectionB",
      fieldPath: "fieldB",
      indexes: [
        {
          queryScope: API.QueryScope.COLLECTION,
          order: API.Order.ASCENDING,
        },
      ],
    };

    const d: Spec.FieldOverride = {
      collectionGroup: "collectionB",
      fieldPath: "fieldB",
      indexes: [
        {
          queryScope: API.QueryScope.COLLECTION,
          arrayConfig: API.ArrayConfig.CONTAINS,
        },
      ],
    };

    expect([b, a, d, c].sort(sort.compareFieldOverride)).to.eql([a, b, c, d]);
  });

  it("should sort ttl true to be last in an array of Spec field overrides", () => {
    // Sorts first because of collectionGroup
    const a: Spec.FieldOverride = {
      collectionGroup: "collectionA",
      fieldPath: "fieldA",
      ttl: false,
      indexes: [],
    };
    const b: Spec.FieldOverride = {
      collectionGroup: "collectionA",
      fieldPath: "fieldB",
      ttl: true,
      indexes: [],
    };
    const c: Spec.FieldOverride = {
      collectionGroup: "collectionB",
      fieldPath: "fieldA",
      ttl: false,
      indexes: [],
    };
    const d: Spec.FieldOverride = {
      collectionGroup: "collectionB",
      fieldPath: "fieldB",
      ttl: true,
      indexes: [],
    };
    expect([b, a, d, c].sort(sort.compareFieldOverride)).to.eql([a, b, c, d]);
  });

  it("should correctly sort an array of API indexes", () => {
    // Sorts first because of collectionGroup
    const a: API.Index = {
      name: "/projects/project/databases/(default)/collectionGroups/collectionA/indexes/a",
      queryScope: API.QueryScope.COLLECTION,
      fields: [],
    };

    // fieldA ASCENDING should sort before fieldA DESCENDING
    const b: API.Index = {
      name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/b",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        {
          fieldPath: "fieldA",
          order: API.Order.ASCENDING,
        },
      ],
    };

    // This compound index sorts before the following simple
    // index because the first element sorts first.
    const c: API.Index = {
      name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/c",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        {
          fieldPath: "fieldA",
          order: API.Order.ASCENDING,
        },
        {
          fieldPath: "fieldB",
          order: API.Order.ASCENDING,
        },
      ],
    };

    const d: API.Index = {
      name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/d",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        {
          fieldPath: "fieldA",
          order: API.Order.DESCENDING,
        },
      ],
    };

    expect([b, a, d, c].sort(sort.compareApiIndex)).to.eql([a, b, c, d]);
  });

  it("should correctly sort an array of API field overrides", () => {
    // Sorts first because of collectionGroup
    const a: API.Field = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collectionA/fields/fieldA",
      indexConfig: {
        indexes: [],
      },
    };

    const b: API.Field = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collectionB/fields/fieldA",
      indexConfig: {
        indexes: [],
      },
    };

    // Order indexes sort before Array indexes
    const c: API.Field = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collectionB/fields/fieldB",
      indexConfig: {
        indexes: [
          {
            queryScope: API.QueryScope.COLLECTION,
            fields: [{ fieldPath: "fieldB", order: API.Order.DESCENDING }],
          },
        ],
      },
    };

    const d: API.Field = {
      name: "/projects/myproject/databases/(default)/collectionGroups/collectionB/fields/fieldB",
      indexConfig: {
        indexes: [
          {
            queryScope: API.QueryScope.COLLECTION,
            fields: [{ fieldPath: "fieldB", arrayConfig: API.ArrayConfig.CONTAINS }],
          },
        ],
      },
    };

    expect([b, a, d, c].sort(sort.compareApiField)).to.eql([a, b, c, d]);
  });
});
