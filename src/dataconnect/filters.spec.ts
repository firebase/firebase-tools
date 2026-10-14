import { expect } from "chai";
import { getResourceFilters, ResourceFilter } from "./filters";

describe("getResourceFilters", () => {
  const cases: {
    desc: string;
    input?: string;
    output?: ResourceFilter[];
    expectErr?: boolean;
  }[] = [
    {
      desc: "No filter",
    },
    {
      desc: "Product level",
      input: "dataconnect",
    },
    {
      desc: "Service level",
      input: "dataconnect:my-service",
      output: [
        {
          serviceId: "my-service",
          fullService: true,
        },
      ],
    },
    {
      desc: "Connector level",
      input: "dataconnect:my-service:my-connector",
      output: [
        {
          serviceId: "my-service",
          connectorId: "my-connector",
        },
      ],
    },
    {
      desc: "Schema only",
      input: "dataconnect:my-service:schema",
      output: [
        {
          serviceId: "my-service",
          schemaOnly: true,
        },
      ],
    },
    {
      desc: "Multiple filters",
      input:
        "dataconnect:my-service:schema,dataconnect:my-other-service:my-connector,dataconnect:my-other-service",
      output: [
        {
          serviceId: "my-service",
          schemaOnly: true,
        },
        {
          serviceId: "my-other-service",
          connectorId: "my-connector",
        },
        {
          serviceId: "my-other-service",
          fullService: true,
        },
      ],
    },
    {
      desc: "Invalid filter",
      input: "dataconnect:service:conn:schema",
      expectErr: true,
    },
  ];
  for (const c of cases) {
    it(c.desc, () => {
      try {
        expect(getResourceFilters({ only: c.input })).to.deep.equal(c.output);
      } catch (err) {
        expect(c.expectErr, `Unexepcted error ${err}`).to.be.true;
      }
    });
  }
});
