import { expect } from "chai";
import * as names from "./names";

describe("names.ts", () => {
  describe("parseServiceName", () => {
    const cases: {
      desc: string;
      input: string;
      want: {
        projectId?: string;
        location?: string;
        serviceId?: string;
        error?: boolean;
      };
    }[] = [
      {
        desc: "should parse a well formed service name, and convert back",
        input: "projects/proj/locations/us-central1/services/serve",
        want: {
          projectId: "proj",
          location: "us-central1",
          serviceId: "serve",
        },
      },
      {
        desc: "should error on an invalid service name",
        input: "projects/proj/locations/us-central1/functions/funky",
        want: {
          error: true,
        },
      },
    ];
    for (const c of cases) {
      it(c.desc, () => {
        try {
          const got = names.parseServiceName(c.input);
          expect(got.projectId).to.equal(c.want.projectId);
          expect(got.location).to.equal(c.want.location);
          expect(got.serviceId).to.equal(c.want.serviceId);
          expect(got.toString()).to.equal(c.input);
        } catch (err) {
          expect(c.want.error, `Unexpected error: ${err}`).to.be.true;
        }
      });
    }
  });

  describe("parseConnectorName", () => {
    const cases: {
      desc: string;
      input: string;
      want: {
        projectId?: string;
        location?: string;
        serviceId?: string;
        connectorId?: string;
        error?: boolean;
      };
    }[] = [
      {
        desc: "should parse a well formed service name, and convert back",
        input: "projects/proj/locations/us-central1/services/serve/connectors/connect",
        want: {
          projectId: "proj",
          location: "us-central1",
          serviceId: "serve",
          connectorId: "connect",
        },
      },
      {
        desc: "should error on an invalid connector name",
        input: "projects/proj/locations/us-central1/functions/funky",
        want: {
          error: true,
        },
      },
    ];
    for (const c of cases) {
      it(c.desc, () => {
        try {
          const got = names.parseConnectorName(c.input);
          expect(got.projectId).to.equal(c.want.projectId);
          expect(got.location).to.equal(c.want.location);
          expect(got.serviceId).to.equal(c.want.serviceId);
          expect(got.connectorId).to.equal(c.want.connectorId);
          expect(got.toString()).to.equal(c.input);
        } catch (err) {
          expect(c.want.error, `Unexpected error: ${err}`).to.be.true;
        }
      });
    }
  });
});
