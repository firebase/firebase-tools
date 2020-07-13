- Enables runtime for Cloud Functions to be set in `firebase.json` (#2241, thanks @quentinvernot!), for example:

  ```
  {
    "functions": {
      "runtime": "nodejs10"
    }
  }
  ```

- Fixes an issue where the suggested redeploy command for Firebase Functions was incorrect for names with dashes.
