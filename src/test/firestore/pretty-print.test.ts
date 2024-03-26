import { expect } from "chai";
import * as API from "../../firestore/api-types";
import { PrettyPrint } from "../../firestore/pretty-print";

const printer = new PrettyPrint();

describe("prettyIndexString", () => {
  it("should correctly print an order type Index", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [
            { fieldPath: "foo", order: API.Order.ASCENDING },
            { fieldPath: "bar", order: API.Order.DESCENDING },
          ],
        },
        false,
      ),
    ).to.contain("(foo,ASCENDING) (bar,DESCENDING) ");
  });

  it("should correctly print a contains type Index", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [
            { fieldPath: "foo", order: API.Order.ASCENDING },
            { fieldPath: "baz", arrayConfig: API.ArrayConfig.CONTAINS },
          ],
        },
        false,
      ),
    ).to.contain("(foo,ASCENDING) (baz,CONTAINS) ");
  });

  it("should correctly print a vector type Index", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [{ fieldPath: "foo", vectorConfig: { dimension: 100, flat: {} } }],
        },
        false,
      ),
    ).to.contain("(foo,VECTOR<100>) ");
  });

  it("should correctly print a vector type Index with other fields", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [
            { fieldPath: "foo", order: API.Order.ASCENDING },
            { fieldPath: "bar", vectorConfig: { dimension: 200, flat: {} } },
          ],
        },
        false,
      ),
    ).to.contain("(foo,ASCENDING) (bar,VECTOR<200>) ");
  });
});
