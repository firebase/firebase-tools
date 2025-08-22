import { expect } from "chai";
import { convertInputToValue, firestoreDocumentToJson } from "./converter";
import { FirestoreDocument } from "../../../gcp/firestore";

describe("firestore converter", () => {
  describe("convertInputToValue", () => {
    it("should convert various javascript types to FirestoreValue", () => {
      expect(convertInputToValue(null)).to.deep.equal({ nullValue: null });
      expect(convertInputToValue(true)).to.deep.equal({ booleanValue: true });
      expect(convertInputToValue(123)).to.deep.equal({ integerValue: "123" });
      expect(convertInputToValue(123.45)).to.deep.equal({ doubleValue: 123.45 });
      expect(convertInputToValue("hello")).to.deep.equal({ stringValue: "hello" });
      expect(convertInputToValue([1, "a"])).to.deep.equal({
        arrayValue: { values: [{ integerValue: "1" }, { stringValue: "a" }] },
      });
      expect(convertInputToValue({ latitude: 1, longitude: 2 })).to.deep.equal({
        geoPointValue: { latitude: 1, longitude: 2 },
      });
      expect(convertInputToValue({ a: 1 })).to.deep.equal({
        mapValue: { fields: { a: { integerValue: "1" } } },
      });
    });
  });

  describe("firestoreDocumentToJson", () => {
    it("should convert a FirestoreDocument to a JSON object", () => {
      const doc: FirestoreDocument = {
        name: "projects/p/databases/d/documents/my-collection/my-doc",
        fields: {
          aString: { stringValue: "hello" },
          aNumber: { integerValue: "123" },
          aBigNumber: { integerValue: "9007199254740992" }, // > MAX_SAFE_INTEGER
          aBool: { booleanValue: false },
          aNull: { nullValue: null },
          anArray: {
            arrayValue: { values: [{ stringValue: "a" }, { integerValue: "1" }] },
          },
          aMap: {
            mapValue: { fields: { nested: { stringValue: "value" } } },
          },
          aTimestamp: { timestampValue: "2024-01-01T00:00:00Z" },
          aGeopoint: { geoPointValue: { latitude: 1, longitude: 2 } },
          aReference: { referenceValue: "projects/p/databases/d/documents/c/d" },
        },
        createTime: "",
        updateTime: "",
      };

      const json = firestoreDocumentToJson(doc);

      expect(json).to.deep.equal({
        __path__: "my-collection/my-doc",
        aString: "hello",
        aNumber: 123,
        aBigNumber: "9007199254740992",
        aBool: false,
        aNull: null,
        anArray: ["a", 1],
        aMap: { nested: "value" },
        aTimestamp: { __type__: "Timestamp", value: "2024-01-01T00:00:00Z" },
        aGeopoint: { __type__: "GeoPoint", value: [1, 2] },
        aReference: { __type__: "Reference", value: "projects/p/databases/d/documents/c/d" },
      });
    });

    it("should handle documents with no fields", () => {
      const doc: FirestoreDocument = {
        name: "projects/p/databases/d/documents/my-collection/my-doc",
        fields: {},
        createTime: "",
        updateTime: "",
      };
      const json = firestoreDocumentToJson(doc);
      expect(json).to.deep.equal({ __path__: "my-collection/my-doc" });
    });
  });
});
