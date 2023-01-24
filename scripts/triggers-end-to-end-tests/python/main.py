from firebase_functions import db, https
from firebase_admin import initialize_app

initialize_app()

"""
Log snippets that the driver program above checks for. Be sure to update
  ../test.js if you plan on changing these.
"""
PUBSUB_FUNCTION_LOG = "========== PYTHON PUBSUB FUNCTION =========="
RTDB_LOG = "========== PYTHON RTDB FUNCTION =========="
STORAGE_FUNCTION_ARCHIVED_LOG = "========== PYTHON STORAGE FUNCTION ARCHIVED =========="
STORAGE_FUNCTION_DELETED_LOG = "========== PYTHON STORAGE FUNCTION DELETED =========="
STORAGE_FUNCTION_FINALIZED_LOG = "========== PYTHON STORAGE FUNCTION FINALIZED =========="
STORAGE_FUNCTION_METADATA_LOG = "========== PYTHON STORAGE FUNCTION METADATA =========="
STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG = "========== PYTHON STORAGE BUCKET FUNCTION ARCHIVED =========="
STORAGE_BUCKET_FUNCTION_DELETED_LOG = "========== PYTHON STORAGE BUCKET FUNCTION DELETED =========="
STORAGE_BUCKET_FUNCTION_FINALIZED_LOG = "========== PYTHON STORAGE BUCKET FUNCTION FINALIZED =========="
STORAGE_BUCKET_FUNCTION_METADATA_LOG = "========== PYTHON STORAGE BUCKET FUNCTION METADATA =========="

PUBSUB_TOPIC = "test-topic"
START_DOCUMENT_NAME = "test/start"


@https.on_request()
def py_on_req(req: https.Request) -> https.Response:
    print(req.headers)
    print(req.data)
    return https.Response("python_http_reaction")


@https.on_call()
def py_on_call(req: https.CallableRequest):
    print(req.data)
    return req.data


@db.on_value_written(
    reference=START_DOCUMENT_NAME,
)
def py_rtdb_reaction(event: db.DatabaseEvent[db.Change[object]]) -> None:
    """
    This function will be triggered when a value is written to the database.
    """
    print(RTDB_LOG)
    return True
# @storage.on_object_finalized()
# def on_object_finalized_example(event: CloudEvent[StorageObjectData]):
#     """
#     This function will be triggered when a new object is created in the bucket.
#     """
#     print(event)
#
#
# @storage.on_object_archived()
# def on_object_archived_example(event: CloudEvent[StorageObjectData]):
#     """
#     This function will be triggered when an object is archived in the bucket.
#     """
#     print(event)
#
#
# @storage.on_object_deleted()
# def on_object_deleted_example(event: CloudEvent[StorageObjectData]):
#     """
#     This function will be triggered when an object is deleted in the bucket.
#     """
#     print(event)