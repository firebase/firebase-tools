import { expect } from "chai";
import * as tf from "./terraform";

describe("terraform iac", () => {
  interface TestInterface {
    camelCaseField?: string;
    field?: number;
    other?: number;
  }

  describe("expr", () => {
    it("should return an HCLExpression object", () => {
      expect(tf.expr("var.foo")).to.deep.equal({
        "@type": "HCLExpression",
        value: "var.foo",
      });
    });
  });

  describe("copyField", () => {
    it("should copy a field to attributes, converting its name to lower snake case", () => {
      const attrs: Record<string, tf.Value> = {};
      const test: TestInterface = { camelCaseField: "value" };
      tf.copyField(attrs, test, "camelCaseField");
      expect(attrs).to.deep.equal({ camel_case_field: "value" });
    });

    it("should optionally transform the field value", () => {
      const attrs: Record<string, tf.Value> = {};
      const test: TestInterface = { field: 42 };
      tf.copyField(attrs, test, "field", (v) => (v as number) * 2);
      expect(attrs).to.deep.equal({ field: 84 });
    });

    it("should not set anything if the source field is missing", () => {
      const attrs: Record<string, tf.Value> = {};
      const test: TestInterface = { other: 123 };
      tf.copyField(attrs, test, "field");
      expect(attrs).to.deep.equal({});
    });
  });

  describe("renameField", () => {
    it("should copy a field to a different attribute name", () => {
      const attrs: Record<string, tf.Value> = {};
      const test: TestInterface = { field: 42 };
      tf.renameField(attrs, test, "new_field", "field");
      expect(attrs).to.deep.equal({ new_field: 42 });
    });

    it("should not set anything if the source field is missing", () => {
      const attrs: Record<string, tf.Value> = {};
      const test: TestInterface = { other: 123 };
      tf.renameField(attrs, test, "new_field", "field");
      expect(attrs).to.deep.equal({});
    });
  });

  describe("serviceAccount", () => {
    it("should append the IAM domain for short service accounts", () => {
      expect(tf.serviceAccount("my-sa@")).to.equal("my-sa@${var.project}.iam.gserviceaccount.com");
    });

    it("should return identical string if not ending in @", () => {
      expect(tf.serviceAccount("foo@bar.com")).to.equal("foo@bar.com");
    });
  });

  describe("serializeValue", () => {
    it("should serialize strings correctly and inject variable", () => {
      expect(tf.serializeValue("foo")).to.equal('"foo"');
      expect(tf.serializeValue("proj: {{ params.PROJECT_ID }}")).to.equal('"proj: ${var.project}"');
    });

    it("should throw for other parameterized fields", () => {
      expect(() => tf.serializeValue("param: {{ params.OTHER }}")).to.throw(
        "Generalized parameterized fields are not supported in terraform yet",
      );
    });

    it("should serialize numbers and booleans", () => {
      expect(tf.serializeValue(42)).to.equal("42");
      expect(tf.serializeValue(true)).to.equal("true");
    });

    it("should serialize null properly", () => {
      expect(tf.serializeValue(null)).to.equal("null");
    });

    it("should serialize an expression without quotes", () => {
      expect(tf.serializeValue(tf.expr("var.abc"))).to.equal("var.abc");
    });

    it("should serialize simple arrays inline", () => {
      expect(tf.serializeValue([1, 2, 3])).to.equal("[1, 2, 3]");
    });

    it("should serialize arrays of objects with line breaks", () => {
      expect(tf.serializeValue([{ a: 1 }])).to.equal(`[
  {
    a = 1
  }
]`);
    });

    it("should serialize nested objects with proper indentation", () => {
      expect(tf.serializeValue({ a: { b: 2 } })).to.equal(`{
  a = {
    b = 2
  }
}`);
    });
  });

  describe("blockToString", () => {
    it("should stringify a block without labels", () => {
      expect(
        tf.blockToString({
          type: "locals",
          attributes: { foo: "bar" },
        }),
      ).to.equal(`locals {
  foo = "bar"
}`);
    });

    it("should stringify a block with labels", () => {
      expect(
        tf.blockToString({
          type: "resource",
          labels: ["google_function", "my_func"],
          attributes: { name: "test" },
        }),
      ).to.equal(`resource "google_function" "my_func" {
  name = "test"
}`);
    });
  });

  it("should use pretty ordering and spacing for resources", () => {
    const block: tf.Block = {
      type: "resource",
      labels: ["google_cloudfunctions_function", "my_func"],
      attributes: {
        name: "test",
        runtime: "nodejs20",
        count: tf.expr("other_resource.count"),
        depends_on: [tf.expr("other_resource")],
      },
    };
    expect(tf.blockToString(block)).to.equal(`resource "google_cloudfunctions_function" "my_func" {
  count = other_resource.count

  name = "test"
  runtime = "nodejs20"

  depends_on = [other_resource]
}`);
  });
});
