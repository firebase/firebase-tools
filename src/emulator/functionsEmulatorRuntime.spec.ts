import { expect } from "chai";

import { Proxied } from "./functionsEmulatorRuntime";

describe("Proxied.getOriginal", () => {
  it("keeps own static properties of bound functions", () => {
    // Mirrors firebase-admin 13, where `admin.firestore` is an arrow function
    // (no prototype) with members attached to it.
    const firestore: any = () => "instance";
    firestore.Timestamp = class Timestamp {};
    firestore.FieldValue = { serverTimestamp: () => "ts" };
    Object.defineProperty(firestore, "lazy", { get: () => 42, enumerable: true });

    const bound = Proxied.getOriginal({ firestore }, "firestore");

    expect(bound()).to.equal("instance");
    expect(bound.Timestamp).to.equal(firestore.Timestamp);
    expect(bound.FieldValue.serverTimestamp()).to.equal("ts");
    expect(bound.lazy).to.equal(42);
  });

  it("still binds methods to the target", () => {
    const target = {
      value: 7,
      get() {
        return this.value;
      },
    };
    expect(Proxied.getOriginal(target, "get")()).to.equal(7);
  });

  it("returns constructors and non-functions untouched", () => {
    class Foo {}
    expect(Proxied.getOriginal({ Foo }, "Foo")).to.equal(Foo);
    expect(Proxied.getOriginal({ a: 1 }, "a")).to.equal(1);
    expect(Proxied.getOriginal({}, "missing")).to.equal(undefined);
  });
});
