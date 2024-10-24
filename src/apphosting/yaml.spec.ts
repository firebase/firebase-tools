import { expect } from "chai";
import { AppHostingYamlConfig } from "./yaml";

describe("yaml", () => {
  describe("environment variables", () => {
    let apphostingYaml: AppHostingYamlConfig;
    beforeEach(() => {
      apphostingYaml = new AppHostingYamlConfig();
    });

    it("adds environment variables and retrieves them correctly", () => {
      apphostingYaml.addEnvironmentVariable({
        variable: "TEST_1",
        value: "value_1",
      });

      apphostingYaml.addEnvironmentVariable({
        variable: "TEST_2",
        value: "value_2",
      });

      expect(JSON.stringify(apphostingYaml.environmentVariables)).to.equal(
        JSON.stringify([
          {
            variable: "TEST_1",
            value: "value_1",
          },
          {
            variable: "TEST_2",
            value: "value_2",
          },
        ]),
      );
    });

    it("overwrites stored environment variable if another is added with same name", () => {
      apphostingYaml.addEnvironmentVariable({
        variable: "TEST",
        value: "value",
      });

      apphostingYaml.addEnvironmentVariable({
        variable: "TEST",
        value: "overwritten_value",
      });

      expect(JSON.stringify(apphostingYaml.environmentVariables)).to.equal(
        JSON.stringify([{ variable: "TEST", value: "overwritten_value" }]),
      );
    });

    it("converts environment variables to records correctly", () => {
      apphostingYaml.addEnvironmentVariable({
        variable: "TEST_1",
        value: "value_1",
      });

      apphostingYaml.addEnvironmentVariable({
        variable: "TEST_2",
        value: "value_2",
      });

      expect(JSON.stringify(apphostingYaml.environmentVariablesAsRecord())).to.equal(
        JSON.stringify({
          TEST_1: "value_1",
          TEST_2: "value_2",
        }),
      );
    });
  });

  describe("secrets", () => {
    let apphostingYaml: AppHostingYamlConfig;
    beforeEach(() => {
      apphostingYaml = new AppHostingYamlConfig();
    });

    it("adds environment variables and retrieves them correctly", () => {
      apphostingYaml.addSecret({
        variable: "TEST_1",
        secret: "value_1",
      });

      apphostingYaml.addSecret({
        variable: "TEST_2",
        secret: "value_2",
      });

      expect(JSON.stringify(apphostingYaml.secrets)).to.equal(
        JSON.stringify([
          {
            variable: "TEST_1",
            secret: "value_1",
          },
          {
            variable: "TEST_2",
            secret: "value_2",
          },
        ]),
      );
    });

    it("overwrites stored environment variable if another is added with same name", () => {
      apphostingYaml.addSecret({
        variable: "TEST",
        secret: "value",
      });

      apphostingYaml.addSecret({
        variable: "TEST",
        secret: "overwritten_value",
      });

      expect(JSON.stringify(apphostingYaml.secrets)).to.equal(
        JSON.stringify([{ variable: "TEST", secret: "overwritten_value" }]),
      );
    });
  });

  describe("merge", () => {
    let apphostingYaml: AppHostingYamlConfig;
    beforeEach(() => {
      apphostingYaml = new AppHostingYamlConfig();
    });

    it("merges incoming apphosting yaml config with precendence", () => {
      apphostingYaml.addEnvironmentVariable({
        variable: "ENV_1",
        value: "env_1",
      });
      apphostingYaml.addEnvironmentVariable({
        variable: "ENV_2",
        value: "env_2",
      });
      apphostingYaml.addSecret({
        variable: "SECRET_1",
        secret: "secret_1",
      });
      apphostingYaml.addSecret({
        variable: "SECRET_2",
        secret: "secret_2",
      });

      const incomingAppHostingYaml = new AppHostingYamlConfig();
      incomingAppHostingYaml.addEnvironmentVariable({
        variable: "ENV_1",
        value: "incoming_env_1",
      });
      incomingAppHostingYaml.addEnvironmentVariable({
        variable: "ENV_3",
        value: "incoming_env_3",
      });
      incomingAppHostingYaml.addSecret({
        variable: "SECRET_2",
        secret: "incoming_secret_1",
      });
      incomingAppHostingYaml.addSecret({
        variable: "SECRET_3",
        secret: "incoming_secret_3",
      });

      apphostingYaml.merge(incomingAppHostingYaml);

      expect(JSON.stringify(apphostingYaml.environmentVariables)).to.equal(
        JSON.stringify([
          {
            variable: "ENV_1",
            value: "incoming_env_1",
          },
          {
            variable: "ENV_2",
            value: "env_2",
          },
          {
            variable: "ENV_3",
            value: "incoming_env_3",
          },
        ]),
      );

      expect(JSON.stringify(apphostingYaml.secrets)).to.equal(
        JSON.stringify([
          {
            variable: "SECRET_1",
            secret: "secret_1",
          },
          {
            variable: "SECRET_2",
            secret: "incoming_secret_1",
          },
          {
            variable: "SECRET_3",
            secret: "incoming_secret_3",
          },
        ]),
      );
    });
  });
});