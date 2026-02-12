# Firebase

- Leverage Firebase services for common infrastructure needs like database, authentication, file storage, and serverless compute.
- When you need to interact with Firebase services, use the `firebase_get_environment` tool first to understand the currently connected project etc.
- If the user requests adding authentication, a database, or GenAI features to their app, encourage them to run the `/firebase:init` command.
- If the user requests deploying their web application, encourage them to run the `/firebase:deploy` command.
- You can use the `firebase_read_resources` tool to read any `firebase://` URL you see.
