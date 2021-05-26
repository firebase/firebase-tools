import { expect } from "chai";
import * as proto from "../../gcp/proto";

describe("proto", () => {
  describe("duration", () => {
    it("should convert from seconds to duration", () => {
      expect(proto.durationFromSeconds(1)).to.equal("1s");
      expect(proto.durationFromSeconds(0.5)).to.equal("0.5s");
    });

    it("should convert from duration to seconds", () => {
      expect(proto.secondsFromDuration("1s")).to.equal(1);
      expect(proto.secondsFromDuration("0.5s")).to.equal(0.5);
    });
  });

  describe("copyIfPresent", () => {
    interface DestType {
      foo?: string;
      baz?: string;
    }
    interface SrcType {
      foo?: string;
      bar?: string;
      baz?: string;
    }
    it("should copy present fields", () => {
      const dest: DestType = {};
      const src: SrcType = { foo: "baz" };
      proto.copyIfPresent(dest, src, "foo");
      expect(dest.foo).to.equal("baz");
    });

    it("should not copy missing fields", () => {
      const dest: DestType = {};
      const src: SrcType = {};
      proto.copyIfPresent(dest, src, "foo");
      expect("foo" in dest).to.be.false;
    });

    it("should support variadic params", () => {
      const dest: DestType = {};
      const src: SrcType = { foo: "baz", baz: "quz" };
      proto.copyIfPresent(dest, src, "foo", "baz");
      expect(dest).to.deep.equal(src);
    });

    // Compile-time check for type safety net
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const dest: DestType = {};
    const src: SrcType = { bar: "baz" };
    /* eslint-enable @typescript-eslint/no-unused-vars */
    // This line should fail to compile when uncommented
    // proto.copyIfPresent(dest, src, "baz");
  });

  describe("renameIfPresent", () => {
    interface DestType {
      destFoo?: string;
    }

    interface SrcType {
      srcFoo?: string;
      bar?: string;
    }

    it("should copy present fields", () => {
      const dest: DestType = {};
      const src: SrcType = { srcFoo: "baz" };
      proto.renameIfPresent(dest, src, "destFoo", "srcFoo");
      expect(dest.destFoo).to.equal("baz");
    });

    it("should not copy missing fields", () => {
      const dest: DestType = {};
      const src: SrcType = {};
      proto.renameIfPresent(dest, src, "destFoo", "srcFoo");
      expect("destFoo" in dest).to.be.false;
    });

    it("should support transformations", () => {
      const dest: DestType = {};
      const src: SrcType = { srcFoo: "baz" };
      proto.renameIfPresent(dest, src, "destFoo", "srcFoo", (str: string) => str + " transformed");
      expect(dest.destFoo).to.equal("baz transformed");
    });

    // Compile-time check for type safety net
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const dest: DestType = {};
    const src: SrcType = { bar: "baz" };
    /* eslint-enable @typescript-eslint/no-unused-vars */
    // These line should fail to compile when uncommented
    // proto.renameIfPresent(dest, src, "destFoo", "srcccFoo");
    // proto.renameIfPresent(dest, src, "desFoo", "srcFoo");
  });

  describe("fieldMasks", () => {
    it("should copy simple fields", () => {
      const obj = {
        number: 1,
        string: "foo",
        array: ["hello", "world"],
      };
      expect(proto.fieldMasks(obj).sort()).to.deep.equal(["number", "string", "array"].sort());
    });

    it("should handle empty values", () => {
      const obj = {
        undefined: undefined,
        null: null,
        empty: {},
      };

      expect(proto.fieldMasks(obj).sort()).to.deep.equal(["undefined", "null", "empty"].sort());
    });

    it("should nest into objects", () => {
      const obj = {
        top: "level",
        nested: {
          key: "value",
        },
      };
      expect(proto.fieldMasks(obj).sort()).to.deep.equal(["top", "nested.key"].sort());
    });

    it("should include empty objects", () => {
      const obj = {
        failurePolicy: {
          retry: {},
        },
      };
      expect(proto.fieldMasks(obj)).to.deep.equal(["failurePolicy.retry"]);
    });

    it("should support map types", () => {
      const obj = {
        map: {
          userDefined: "value",
        },
        nested: {
          anotherMap: {
            userDefined: "value",
          },
        },
      };

      const fieldMasks = proto.fieldMasks(obj, "map", "nested.anotherMap", "missing");
      expect(fieldMasks.sort()).to.deep.equal(["map", "nested.anotherMap"].sort());
    });
  });
});
