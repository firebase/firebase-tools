# Github Actions

This directory contains [Github Actions](https://help.github.com/en/actions) workflows
used for testing.

## Workflows

- `node-test.yml` - unit tests and integration tests.

## Secrets

The following secrets must be defined on the project:

| Name                          | Description                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `FBTOOLS_TARGET_PROJECT`      | The project ID that should be used for integration tests                       |
| `service_account_json_base64` | A base64-encoded service account JSON file with access to the selected project |
