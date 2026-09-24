import { expect } from "chai";
import * as sinon from "sinon";
import { FirebaseError } from "../../error";
import * as env from "../env";
import { seedKitInstanceEnv } from "./env";

describe("functions/kits/env", () => {
  let writeUserEnvsStub: sinon.SinonStub;

  beforeEach(() => {
    writeUserEnvsStub = sinon.stub(env, "writeUserEnvs");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("seedKitInstanceEnv", () => {
    it("should do nothing if envs is undefined", () => {
      seedKitInstanceEnv({
        configDir: "/path/to/config",
        functionsSource: "/path/to/source",
        projectDir: "/path/to/project",
        projectId: "test-project",
      });

      expect(writeUserEnvsStub).to.not.have.been.called;
    });

    it("should do nothing if envs is empty", () => {
      seedKitInstanceEnv({
        configDir: "/path/to/config",
        functionsSource: "/path/to/source",
        projectDir: "/path/to/project",
        projectId: "test-project",
        envs: {},
      });

      expect(writeUserEnvsStub).to.not.have.been.called;
    });

    it("should throw FirebaseError if projectId is missing when envs has keys", () => {
      expect(() => {
        seedKitInstanceEnv({
          configDir: "/path/to/config",
          functionsSource: "/path/to/source",
          projectDir: "/path/to/project",
          projectId: "",
          envs: { KEY: "value" },
        });
      }).to.throw(
        FirebaseError,
        "A project ID is required to seed environment variables for a kit instance.",
      );

      expect(writeUserEnvsStub).to.not.have.been.called;
    });

    it("should normalize string, number, boolean, array, and map/object values and call writeUserEnvs", () => {
      seedKitInstanceEnv({
        configDir: "/path/to/config",
        functionsSource: "/path/to/source",
        projectDir: "/path/to/project",
        projectId: "my-project",
        projectAlias: "prod",
        envs: {
          STRING_VAL: "hello",
          NUM_VAL: 123,
          ZERO_VAL: 0,
          BOOL_TRUE: true,
          BOOL_FALSE: false,
          LIST_VAL: ["a", "b", "c"],
          OBJECT_VAL: { key: "value", nested: { a: 1 } },
        },
      });

      expect(writeUserEnvsStub).to.have.been.calledOnceWith(
        {
          STRING_VAL: "hello",
          NUM_VAL: "123",
          ZERO_VAL: "0",
          BOOL_TRUE: "true",
          BOOL_FALSE: "false",
          LIST_VAL: "a,b,c",
          OBJECT_VAL: JSON.stringify({ key: "value", nested: { a: 1 } }),
        },
        {
          configDir: "/path/to/config",
          functionsSource: "/path/to/source",
          projectDir: "/path/to/project",
          projectId: "my-project",
          projectAlias: "prod",
        },
      );
    });

    it("should ignore undefined and null entries in envs map", () => {
      seedKitInstanceEnv({
        configDir: "/path/to/config",
        functionsSource: "/path/to/source",
        projectDir: "/path/to/project",
        projectId: "my-project",
        envs: {
          VALID_KEY: "foo",
          // @ts-expect-error testing runtime null/undefined
          NULL_KEY: null,
          // @ts-expect-error testing runtime null/undefined
          UNDEF_KEY: undefined,
        },
      });

      expect(writeUserEnvsStub).to.have.been.calledOnceWith(
        {
          VALID_KEY: "foo",
        },
        {
          configDir: "/path/to/config",
          functionsSource: "/path/to/source",
          projectDir: "/path/to/project",
          projectId: "my-project",
          projectAlias: undefined,
        },
      );
    });
  });
});
