import { expect } from "chai";
import * as admin from "firebase-admin";
import { Proxied } from "./functionsEmulatorRuntime";

describe("Proxied", () => {
  describe("getOriginal", () => {
    it("preserves enumerable and non-enumerable own properties on bound namespace functions", () => {
      const FieldValue = { serverTimestamp: (): string => "TS" };
      const Timestamp = class {};
      const namespaceFn = Object.assign((app?: string): string => `db-${app ?? "default"}`, {
        FieldValue,
        Timestamp,
      });
      const v1Namespace = (): string => "v1";
      Object.defineProperty(namespaceFn, "v1", {
        value: v1Namespace,
        enumerable: false,
        configurable: true,
      });
      const sym = Symbol("internal");
      Object.defineProperty(namespaceFn, sym, {
        value: "sym-value",
        enumerable: false,
      });
      let getterHits = 0;
      Object.defineProperty(namespaceFn, "computed", {
        get: (): number => ++getterHits,
        enumerable: true,
      });

      const target = { firestore: namespaceFn };
      const proxied = new Proxied(target)
        .when("firestore", (t): unknown => Proxied.getOriginal(t, "firestore"))
        .finalize();

      const delivered = proxied.firestore as typeof namespaceFn & {
        v1: typeof v1Namespace;
        [sym]: string;
        computed: number;
      };

      expect(delivered("app1")).to.equal("db-app1");
      expect(delivered.FieldValue).to.equal(FieldValue);
      expect(delivered.FieldValue.serverTimestamp()).to.equal("TS");
      expect(delivered.Timestamp).to.equal(Timestamp);
      expect(delivered.v1).to.equal(v1Namespace);
      expect(delivered[sym]).to.equal("sym-value");
      expect(delivered.computed).to.equal(1);
      expect(delivered.computed).to.equal(2);
      expect(Object.keys(delivered)).to.deep.equal(Object.keys(namespaceFn));
    });

    it("binds `this` to the underlying target object for non-constructor methods", () => {
      interface CounterTarget {
        count: number;
        getCount: ((this: CounterTarget | void) => number) & { meta?: string };
      }
      const target: CounterTarget = {
        count: 42,
        getCount(): number {
          if (!this) {
            throw new Error("Expected `this` to be bound to target");
          }
          return this.count;
        },
      };
      Object.defineProperty(target.getCount, "meta", {
        value: "tag",
        enumerable: true,
      });

      const proxied = new Proxied(target).finalize();
      const detached = proxied.getCount;
      expect(detached()).to.equal(42);
      expect(detached.meta).to.equal("tag");
    });

    it("returns constructors, non-functions, and undefined unchanged", () => {
      class Widget {
        constructor(public readonly id: string) {}
      }
      const obj = { nested: true };
      const target: {
        Widget: typeof Widget;
        obj: { nested: boolean };
        count: number;
        missing?: string;
      } = {
        Widget,
        obj,
        count: 7,
      };
      const proxied = new Proxied(target).finalize();

      expect(proxied.Widget).to.equal(Widget);
      expect(new proxied.Widget("w1").id).to.equal("w1");
      expect(proxied.obj).to.equal(obj);
      expect(proxied.count).to.equal(7);
      expect(proxied.missing).to.be.undefined;
    });

    it("preserves firebase-admin firestore namespace members when proxied", () => {
      const proxiedAdmin = new Proxied(admin)
        .when(
          "firestore",
          (target): typeof admin.firestore =>
            Proxied.getOriginal(target, "firestore") as typeof admin.firestore,
        )
        .finalize();

      expect(Object.keys(proxiedAdmin.firestore)).to.deep.equal(Object.keys(admin.firestore));
      expect(proxiedAdmin.firestore.FieldValue).to.equal(admin.firestore.FieldValue);
      expect(typeof proxiedAdmin.firestore.FieldValue.serverTimestamp).to.equal("function");
      expect(typeof Reflect.get(proxiedAdmin.firestore, "v1")).to.equal("function");
    });
  });
});
