import { expect } from "chai";

import LocalFunction from "./localFunction";
import { EmulatedTriggerDefinition } from "./emulator/functionsEmulatorShared";
import { FunctionsEmulatorShell } from "./emulator/functionsEmulatorShell";

const EMULATED_TRIGGER: EmulatedTriggerDefinition = {
  id: "fn",
  region: "us-central1",
  platform: "gcfv1",
  availableMemoryMb: 1024,
  entryPoint: "test-resource",
  name: "test-resource",
  timeoutSeconds: 3,
};

describe("constructAuth", () => {
  const lf = new LocalFunction(EMULATED_TRIGGER, {}, {} as FunctionsEmulatorShell);

  describe("#_constructAuth", () => {
    it("warn if opts.auth and opts.authType are conflicting", () => {
      expect(() => {
        return lf.constructAuth({ uid: "something" }, "UNAUTHENTICATED");
      }).to.throw("incompatible");

      expect(() => {
        return lf.constructAuth({ admin: false, uid: "something" }, "ADMIN");
      }).to.throw("incompatible");
    });

    it("construct the correct auth for admin users", () => {
      expect(lf.constructAuth(undefined, "ADMIN")).to.deep.equal({ admin: true });
    });

    it("construct the correct auth for unauthenticated users", () => {
      expect(lf.constructAuth(undefined, "UNAUTHENTICATED")).to.deep.equal({
        admin: false,
      });
    });

    it("construct the correct auth for authenticated users", () => {
      expect(lf.constructAuth(undefined, "USER")).to.deep.equal({
        admin: false,
        variable: { uid: "", token: {} },
      });
      expect(lf.constructAuth({ uid: "11" }, "USER")).to.deep.equal({
        admin: false,
        variable: { uid: "11", token: {} },
      });
    });

    it("leaves auth untouched if it already follows wire format", () => {
      const auth = { admin: false, variable: { uid: "something" } };
      expect(lf.constructAuth(auth)).to.deep.equal(auth);
    });
  });
});

describe("makeFirestoreValue", () => {
  const lf = new LocalFunction(EMULATED_TRIGGER, {}, {} as FunctionsEmulatorShell);

  it("returns {} when there is no data", () => {
    expect(lf.makeFirestoreValue()).to.deep.equal({});
    expect(lf.makeFirestoreValue(null)).to.deep.equal({});
    expect(lf.makeFirestoreValue({})).to.deep.equal({});
  });

  it("throws error when data is not key-value pairs", () => {
    expect(() => {
      return lf.makeFirestoreValue("string");
    }).to.throw(Error);
  });
});
