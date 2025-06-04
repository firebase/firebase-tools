# Function Deploy Integration Test

Function deploy integration test cycles through "create -> update -> update -> ..." phases to make sure all supported function triggers are deployed with correct configuration values.

The test isn't "thread-safe" - there should be at most one test running on a project at any given time. I suggest you to use your own project to run the test.

You can set the test project and run the integration test as follows:

```bash
$  GCLOUD_PROJECT=${PROJECT_ID} npm run test:functions-deploy
```

The integration test blows away all existing functions! Don't run it on a project where you have functions you'd like to keep.

You can also run the test target with `FIREBASE_DEBUG=true` to pass `--debug` flag to CLI invocation:

```bash
$  GCLOUD_PROJECT=${PROJECT_ID} FIREBASE_DEBUG=true npm run test:functions-deploy
```
