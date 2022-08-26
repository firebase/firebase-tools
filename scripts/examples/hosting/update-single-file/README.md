# update-single-file

This is an example script for how to use `google-auth-library` to upload a single file to a Hosting site.

## Getting Started

The easiest way to run the tool is to link it into your Node environment, set up authentication, and run the script in your project folder.

### Build the Script

To run this, clone the repository, go to this directory, and build it:

```bash
cd firebase-tools/scripts/examples/hosting/update-single-file/
npm install
npm run build
npm link
```

### Set up Credentials

Two options exist to set up credentials. If you're running in a GCP environment (like Cloud Shell), you may be able to skip this step entirely.

First option, set up application default credentials via `gcloud`:

```bash
# Set up application default credentials using gcloud (optional if in GCP environment).
gcloud auth application-default login
# It may be required to set a quota project for the credentials - used to account for the API usage.
gcloud auth application-default set-quota-project <project-id>
```

Alternatively, if you (want to) use a service account and set `GOOGLE_APPLICATION_CREDENTIALS` instead of using `gcloud`, that works well too. See Google Cloud's [getting started with authentication](https://cloud.google.com/docs/authentication/getting-started) for more infromation on how to set one up.

### Run the Script

In the directory that you specified as `public` in your Firebase Hosting configuration:

```bash
cd my-app/public/
update-single-file --project <project-id> [--site <site-id>] <files...>
```

For example, if you want to update `/team/about.html` in your site you would:

```bash
cd my-app/public/
update-single-file --project my-app team/about.html
```

## Options

`--project <project-id>`: **required** specifies the project deploy to.
`--site <site-id>`: specifies the site to deploy to, defaults to `<project-id>`.

## Debugging

To see logs of HTTP requests being made, run the script with `DEBUG=update-single-file`.
