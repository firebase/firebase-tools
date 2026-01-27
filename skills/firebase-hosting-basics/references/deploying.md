# Deploying to Firebase Hosting

## Standard Deployment
To deploy your Hosting content and configuration to your live site:

```bash
firebase deploy --only hosting
```

This deploys to your default sites (`PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com`).

## Preview Channels
Preview channels allow you to test changes on a temporary URL before going live.

### Deploy to a Preview Channel
```bash
firebase hosting:channel:deploy CHANNEL_ID
```
Replace `CHANNEL_ID` with a name (e.g., `feature-beta`).
This returns a preview URL like `PROJECT_ID--CHANNEL_ID-RANDOM_HASH.web.app`.

### Expiration
Channels expire after 7 days by default. To set a different expiration:
```bash
firebase hosting:channel:deploy CHANNEL_ID --expires 1d
```

## Cloning to Live
You can promote a version from a preview channel to your live channel without rebuilding.

```bash
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live
```

**Example:**
Clone the `feature-beta` channel on your default site to live:
```bash
firebase hosting:clone my-project:feature-beta my-project:live
```
