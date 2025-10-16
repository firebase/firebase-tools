import { resource } from "../../resource";

export const init_data_connect = resource(
  {
    uri: "firebase://guides/init/data_connect",
    name: "data_connect_init_guide",
    title: "Firebase Data Connect Init Guide",
    description:
      "guides the coding agent through configuring Data Connect for PostgreSQL access in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
First, ask the user what they would like to name their service.
Then, ask the user to provide a description of the app they are trying to build.

Call the 'firebase_init' tools with the features.dataconnect argument set to:

{
  description: The description the user provided above,
  service_id: The service ID the user provided
  instance_id: <serviceId>-fdc
  location_id: us-east4
  provision_cloudsql: true
}

`.trim(),
        },
      ],
    };
  },
);
