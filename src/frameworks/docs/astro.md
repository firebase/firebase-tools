# Integrate Astro

Using the {{firebase_cli}}, you can deploy your Astro Web apps to Firebase and
serve them with {{firebase_hosting}}. The {{cli}} respects your Astro settings and
translates them to Firebase settings with zero or minimal extra configuration on
your part. If your app includes dynamic server-side logic, the {{cli}} deploys that
logic to {{cloud_functions_full}}.

Note: Framework-aware {{hosting}} is an early public preview. This means
that the functionality might change in backward-incompatible ways. A preview
release is not subject to any SLA or deprecation policy and may receive limited
or no support.

## Before you begin

Before you get started deploying your app to Firebase,
review the following requirements and options:

- {{firebase_cli}} version 12.1.0 or later. Make sure to
  [install the {{cli}}](/docs/cli#install_the_firebase_cli)
  using your preferred method.
- Optional: Billing enabled on your Firebase project
  (required if you plan to use SSR)
- An existing Astro project. You can create one with `npm init astro@latest`.


## Initialize Firebase

To get started, initialize Firebase for your framework project.
Use the {{firebase_cli}} for a new project, or modify `firebase.json` for an
existing project.

### Initialize a new project

1. In the {{firebase_cli}}, enable the web frameworks preview:
   <pre class="devsite-terminal">firebase experiments:enable webframeworks</pre>
1. Run the initialization command from the {{cli}} and then follow the prompts:
   <pre class="devsite-terminal">firebase init hosting</pre>
1.  Answer yes to "Do you want to use a web framework? (experimental)"
1.  Choose your hosting source directory.  If there is an existing Astro codebase,
    the CLI detects it and the process completes.

## Serve static content

After initializing Firebase, you can serve static content with the standard
deployment command:

```shell
firebase deploy
```

You can [view your deployed app](/docs/hosting/test-preview-deploy#view-changes)
on its live site.

## Pre-render dynamic content

Astro will prerender all pages to static files and will work on Firebase Hosting without any configuration changes.

If you need a small set of pages to SSR, configure `output: 'hybrid'` as
shown in
[converting a static site to hybrid rendering](https://docs.astro.build/en/guides/server-side-rendering/#converting-a-static-site-to-hybrid-rendering`).

With these settings prerendering is still the default, but you can opt in to SSR by
adding `const prerender = false` at the top of any Astro page. Similarly, in `output: 'server'` where
server rendering is the default you can opt in to prerendering by adding 
`const prerender = true`.

## Serve fully dynamic content (SSR)

Deploying an Astro application with SSR on Firebase Hosting requires the 
@astrojs/node adapter in middleware mode. See the detailed instructions in the
Astro docs for setting up the
[node adapter](https://docs.astro.build/en/guides/integrations-guide/node/)
and for [SSR](https://docs.astro.build/en/guides/server-side-rendering/).

As noted in the Astro guidance, SSR also requires setting the `output` property to either `server` or `hybrid` in `astro.config.mjs`.
