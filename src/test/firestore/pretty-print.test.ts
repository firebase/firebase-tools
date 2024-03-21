import { expect } from "chai";
import { PrettyPrint } from "../../firestore/pretty-print";
import * as API from "../../firestore/api-types";
import * as Spec from "../../firestore/api-spec";
import * as sort from "../../firestore/api-sort";

const printer = new PrettyPrint();

describe("prettyIndexString", () => {
  it("should correctly print an order type Index", () => {
    expect(printer.prettyIndexString({
      name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        { fieldPath: "foo", order: API.Order.ASCENDING },
        { fieldPath: "bar", order: API.Order.DESCENDING },
      ],
    }, false)).to.equal("\u001b[36m(collectionB)\u001b[39m -- (foo,ASCENDING) (bar,DESCENDING) ");
  });

  it("should correctly print a contains type Index", () => {
    expect(printer.prettyIndexString({
      name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        { fieldPath: "foo", order: API.Order.ASCENDING },
        { fieldPath: "baz", arrayConfig: API.ArrayConfig.CONTAINS },
      ],
    }, false)).to.equal("\u001b[36m(collectionB)\u001b[39m -- (foo,ASCENDING) (baz,CONTAINS) ");
  });

  it("should correctly print a vector type Index", () => {
    expect(printer.prettyIndexString({
      name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        { fieldPath: "foo", vectorConfig: {dimension: 100, flat: {}} },
      ],
    }, false)).to.equal("\u001b[36m(collectionB)\u001b[39m -- (foo,VECTOR<100>) ");
  });

  it("should correctly print a vector type Index with other fields", () => {
    expect(printer.prettyIndexString({
      name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
      queryScope: API.QueryScope.COLLECTION,
      fields: [
        { fieldPath: "foo", order: API.Order.ASCENDING },
        { fieldPath: "bar", vectorConfig: {dimension: 200, flat: {}} },
      ],
    }, false)).to.equal("\u001b[36m(collectionB)\u001b[39m -- (foo,ASCENDING) (bar,VECTOR<200>) ");
  });
});
