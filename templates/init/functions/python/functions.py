from firebase_functions import functions

@functions.https(memory_mb=256)
def http_function(request):
  return 'Hello world'

@functions.pubsub(
  topic='news',
  min_instances=1,
)
def pubsub_function(event, context):
  print('pubsub:', event, context)