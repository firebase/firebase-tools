import { expect } from "chai";
import { AppHostingYamlConfig } from "./yaml";

describe("merge", () => {
  it("merges incoming apphosting yaml config with precendence", () => {
    const apphostingYaml = AppHostingYamlConfig.empty();
    apphostingYaml.env = {
      ENV_1: { value: "env_1" },
      ENV_2: { value: "env_2" },
      SECRET: { secret: "secret_1" },
    };

    const incomingAppHostingYaml = AppHostingYamlConfig.empty();
    incomingAppHostingYaml.env = {
      ENV_1: { value: "incoming_env_1" },
      ENV_3: { value: "incoming_env_3" },
      SECRET_2: { value: "incoming_secret_2" },
    };

    apphostingYaml.merge(incomingAppHostingYaml);
    expect(apphostingYaml.env).to.deep.equal({
      ENV_1: { value: "incoming_env_1" },
      ENV_2: { value: "env_2" },
      ENV_3: { value: "incoming_env_3" },
      SECRET: { secret: "secret_1" },
      SECRET_2: { value: "incoming_secret_2" },
    });
  });

  it("conditionally allows secrets to become plaintext", () => {
    const apphostingYaml = AppHostingYamlConfig.empty();
    apphostingYaml.env = {
      API_KEY: { secret: "api_key" },
    };

    const incomingYaml = AppHostingYamlConfig.empty();
    incomingYaml.env = {
      API_KEY: { value: "plaintext" },
    };

    expect(() =>
      apphostingYaml.merge(incomingYaml, /* alllowSecretsToBecomePlaintext */ false),
    ).to.throw("Cannot convert secret to plaintext in apphosting yaml");

    expect(() =>
      apphostingYaml.merge(incomingYaml, /* alllowSecretsToBecomePlaintext */ true),
    ).to.not.throw();
    expect(apphostingYaml.env).to.deep.equal({
      API_KEY: { value: "plaintext" },
    });
  });
});
