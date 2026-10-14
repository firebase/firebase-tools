# WebFrameworks Deploy Integration Test

This integration test deploys a nextjs hosted project with webframeworks enabled.

The test isn't "thread-safe" - there should be at most one test running on a project at any given time.
I suggest you to use your own project to run the test.

You can set the test project and run the integration test as follows:

```bash
$  GCLOUD_PROJECT=${PROJECT_ID} npm run test:webframeworks-deploy
```

The integration test blows whats being hosted! Don't run it on a project where you have functions you'd like to keep.

You can also run the test target with `FIREBASE_DEBUG=true` to pass `--debug` flag to CLI invocation:

```bash
$  GCLOUD_PROJECT=${PROJECT_ID} FIREBASE_DEBUG=true npm run test:webframeworks-deploy
```
