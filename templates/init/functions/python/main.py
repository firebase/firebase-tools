# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

from firebase_functions import https, options


@https.on_call(memory=options.Memory.MB_256)
def hellofunction(request):
    return ('Hello World!', 200, {})
