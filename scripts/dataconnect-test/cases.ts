export interface TestCase {
  description: string;
  sequence: Step[];
}

export interface Step {
  schemaGQL: string;
  connectorGQL: string;
  expectErr: boolean;
}

export const cases: TestCase[] = [
  {
    description: "Schema migration: adding a field",
    sequence: [
      {
        schemaGQL: `type Order @table {
          name: String!
        }`,
        connectorGQL: `mutation createOrder($name: String!) {
          order_insert(data : {name: $name})
        }`,
        expectErr: false,
      },
      {
        schemaGQL: `type Order @table {
          name: String!
          price: Int!
        }`,
        connectorGQL: `mutation createOrder($name: String!) {
          order_insert(data : {name: $name, price: 1})
        }`,
        expectErr: false,
      },
    ],
  },
  {
    description: "Schema migration: removing a field",
    sequence: [
      {
        schemaGQL: `type Order @table {
          name: String!
          price: Int!
        }`,
        connectorGQL: `mutation createOrder($name: String!) {
          order_insert(data : {name: $name, price: 1})
        }`,
        expectErr: false,
      },
      {
        schemaGQL: `type Order @table {
          name: String!
        }`,
        connectorGQL: `mutation createOrder($name: String!) {
          order_insert(data : {name: $name})
        }`,
        expectErr: false,
      },
    ],
  },
  {
    description: "Vector embeddings",
    sequence: [
      {
        schemaGQL: `type Order @table {
          name: String!
          v: Vector! @col(size:768)
        }`,
        connectorGQL: `mutation createOrder($name: String!) {
          order_insert(data : {name: $name, v_embed: {model: "textembedding-gecko@001", text: $name}})
        }`,
        expectErr: false,
      },
    ],
  },
];
