# update-single-file

This is an example script for how to use `google-auth-library` to upload a single file to a Hosting site.

## Getting Started

To run this, clone the repository, go to this directory, and build it:

```bash
npm install
npm run build
```

The easiest way to run the tool is to link it into your Node environment, set up authentication using `gcloud`, and run the script in your project.

```bash
# In the `update-single-file` directory:
npm link

# Set up application default credentials using gcloud (optional if in GCP environment).
gcloud auth application-default login
# It may be required to set a billing quota project for the credentials.
gcloud auth application-default set-quota-project <project-id>

# In your `public` directory (with your Hosting files):
update-single-file --project <project-id> [--site <site-id>] <files...>
```

## Options

`--project <project-id>`: **required** specifies the project deploy to.
`--site <site-id>`: specifies the site to deploy to, defaults to `<project-id>`.

## Debugging

To see logs of HTTP requests being made, run the script with `DEBUG=update-single-file`.