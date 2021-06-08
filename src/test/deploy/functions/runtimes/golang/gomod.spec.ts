import { expect } from "chai";
import * as gomod from "../../../../../deploy/functions/runtimes/golang/gomod";
import * as go from "../../../../../deploy/functions/runtimes/golang";

const MOD_NAME = "acme.com/fucntions";
const GO_VERSION = "1.13";
const FUNCTIONS_MOD = "firebase.google.com/firebase-functions-go";
const MIN_MODULE = `module ${MOD_NAME}

go ${GO_VERSION}
`;

const INLINE_MODULE = `${MIN_MODULE}
require ${go.ADMIN_SDK} v4.6.0 // indirect

replace ${FUNCTIONS_MOD} => ${go.FUNCTIONS_SDK}
`;

const BLOCK_MODULE = `${MIN_MODULE}

require (
  ${go.ADMIN_SDK} v4.6.0 // indirect
)

replace (
  ${FUNCTIONS_MOD} => ${go.FUNCTIONS_SDK}
)
`;

describe("Modules", () => {
  it("Should parse a bare minimum module", () => {
    const mod = gomod.parseModule(MIN_MODULE);
    expect(mod.module).to.equal(MOD_NAME);
    expect(mod.version).to.equal(GO_VERSION);
  });

  it("Should parse inline statements", () => {
    const mod = gomod.parseModule(INLINE_MODULE);
    expect(mod.module).to.equal(MOD_NAME);
    expect(mod.version).to.equal(GO_VERSION);
    expect(mod.dependencies).to.deep.equal({
      [go.ADMIN_SDK]: "v4.6.0",
    });
    expect(mod.replaces).to.deep.equal({
      [FUNCTIONS_MOD]: go.FUNCTIONS_SDK,
    });
  });

  it("Should parse block statements", () => {
    const mod = gomod.parseModule(BLOCK_MODULE);
    expect(mod.module).to.equal(MOD_NAME);
    expect(mod.version).to.equal(GO_VERSION);
    expect(mod.dependencies).to.deep.equal({
      [go.ADMIN_SDK]: "v4.6.0",
    });
    expect(mod.replaces).to.deep.equal({
      [FUNCTIONS_MOD]: go.FUNCTIONS_SDK,
    });
  });
});
