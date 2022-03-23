# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

# import firebase_functions

# @functions.https(memory_mb=256)
def hellofunction(request):
    return ('Hello World!', 200, {})


# @functions.https(memory_mb=256)
def foofunction(request):
    return ('Hello World!', 200, {})
