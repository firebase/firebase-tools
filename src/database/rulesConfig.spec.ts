import { expect } from "chai";
import * as sinon from "sinon";
import { getRulesConfig } from "./rulesConfig";
import { Options } from "../options";
import { RC } from "../rc";

describe("rulesConfig", () => {
  describe("getRulesConfig", () => {
    it("should return empty array if database config is not defined", () => {
      const options = {
        config: {
          src: {},
        },
      } as Options;

      const result = getRulesConfig("projectId", options);

      expect(result).to.deep.equal([]);
    });

    it("should get rules config for single database config", () => {
      const options = {
        config: {
          src: {
            database: {
              rules: "rules.json",
            },
          },
        },
        project: "projectId",
      } as Options;

      const result = getRulesConfig("projectId", options);

      expect(result).to.deep.equal([{ instance: "projectId-default-rtdb", rules: "rules.json" }]);
    });

    it("should get rules config for multiple database configs", () => {
      const options = {
        config: {
          src: {
            database: [
              {
                instance: "instance1",
                rules: "rules1.json",
              },
              {
                instance: "instance2",
                rules: "rules2.json",
              },
            ],
          },
        },
        rc: new RC(),
      } as Options;

      const result = getRulesConfig("projectId", options);

      expect(result).to.deep.equal([
        { instance: "instance1", rules: "rules1.json" },
        { instance: "instance2", rules: "rules2.json" },
      ]);
    });

    it("should filter rules config by 'only' option", () => {
      const options = {
        config: {
          src: {
            database: [
              {
                target: "target1",
                rules: "rules1.json",
              },
              {
                target: "target2",
                rules: "rules2.json",
              },
            ],
          },
        },
        only: "database:target1",
        rc: {
          requireTarget: sinon.spy(),
          target: sinon.stub().returns(["instance1"]),
        } as any,
      } as Options;

      const result = getRulesConfig("projectId", options);

      expect(result).to.deep.equal([{ instance: "instance1", rules: "rules1.json" }]);
    });

    it("should throw error if target is not found", () => {
      const options = {
        config: {
          src: {
            database: [
              {
                target: "target1",
                rules: "rules1.json",
              },
            ],
          },
        },
        only: "database:target2",
        rc: {
          requireTarget: sinon.spy(),
          target: sinon.stub().returns([]),
        } as any,
      } as Options;

      expect(() => getRulesConfig("projectId", options)).to.throw(
        "Could not find configurations in firebase.json for the following database targets: target2",
      );
    });

    it("should throw error if config is invalid", () => {
      const options = {
        config: {
          src: {
            database: [{}],
          },
        },
        rc: new RC(),
      } as Options;

      expect(() => getRulesConfig("projectId", options)).to.throw(
        'Must supply either "target" or "instance" in database config',
      );
    });
  });
});
