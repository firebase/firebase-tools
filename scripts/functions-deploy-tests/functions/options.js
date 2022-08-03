export const v1Opts = {"memory":"128MB","maxInstances":42,"timeoutSeconds":42};
export const v2Opts = {"memory":"128MiB","maxInstances":42,"timeoutSeconds":42,"cpu":2,"concurrency":42};
export const v1TqOpts = {"retryConfig":{"maxAttempts":42,"maxRetrySeconds":42,"maxBackoffSeconds":42,"maxDoublings":42,"minBackoffSeconds":42},"rateLimits":{"maxDispatchesPerSecond":42,"maxConcurrentDispatches":42}};
export const v2TqOpts = {"retryConfig":{"maxAttempts":42,"maxRetrySeconds":42,"maxBackoffSeconds":42,"maxDoublings":42,"minBackoffSeconds":42},"rateLimits":{"maxDispatchesPerSecond":42,"maxConcurrentDispatches":42}};
export const v1IdpOpts = {"blockingOptions":{"idToken":true,"refreshToken":true,"accessToken":false}};
export const v2IdpOpts = {"idToken":true,"refreshToken":true,"accessToken":true};
export const v1ScheduleOpts = {"retryCount":3,"minBackoffDuration":"42s","maxRetryDuration":"42s","maxDoublings":42,"maxBackoffDuration":"42s"};
