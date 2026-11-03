import { expect } from "chai";

import { hostingChannelDeployAction } from "./hosting-channel-deploy";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { HostingOptions } from "../hosting/options";

describe("hosting:channel:deploy", () => {
  it("should throw an actionable error when channelId is missing", async () => {
    const options = { project: "my-project" } as unknown as Options & HostingOptions;

    await expect(hostingChannelDeployAction("", options)).to.be.rejectedWith(
      FirebaseError,
      /A channel ID is required\. Run firebase hosting:channel:deploy <channelId>/,
    );
  });

  it("should refuse to deploy to the live channel", async () => {
    const options = { project: "my-project" } as unknown as Options & HostingOptions;

    await expect(hostingChannelDeployAction("live", options)).to.be.rejectedWith(
      FirebaseError,
      /Cannot deploy to the .*live.* channel/,
    );
  });
});
