# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

from firebase_functions import https, pubsub, options


@https.on_call(memory=options.Memory.MB_256)
def hellofunctiononcall(request: https.CallableRequest):
    return 'Hello, world!'


@https.on_request(memory=options.Memory.MB_256)
def hellofunctiononrequest(request: https.FlaskRequest, response: https.FlaskResponse):
    response.status_code = 200
    response.set_data('Hello World (on_request)!')


# @pubsub.on_message_published(topic='cool_things', memory=options.Memory.MB_512)
# def pubsubfunction(message: pubsub.CloudEventMessage):
#     return ''
