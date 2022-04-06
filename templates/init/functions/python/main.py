# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

from firebase_functions import functions


@functions.https(memory_mb=256)
def hellofunction(request):
    return ('HELLO World!', 200, {})


@functions.https(memory_mb=256)
def foofunction(request):
    return ('FOO World!', 200, {})


@functions.pubsub(
    topic='news',
    min_instances=1,
)
def pubsub_function(event, context):
    print('pubsub:', event, context)
