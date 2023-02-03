from firebase_functions import core, db, https, pubsub, storage
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
STORAGE_FUNCTION_FINALIZED_LOG = (
    "========== PYTHON STORAGE FUNCTION FINALIZED =========="
)
STORAGE_FUNCTION_METADATA_LOG = "========== PYTHON STORAGE FUNCTION METADATA =========="
STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG = (
    "========== PYTHON STORAGE BUCKET FUNCTION ARCHIVED =========="
)
STORAGE_BUCKET_FUNCTION_DELETED_LOG = (
    "========== PYTHON STORAGE BUCKET FUNCTION DELETED =========="
)
STORAGE_BUCKET_FUNCTION_FINALIZED_LOG = (
    "========== PYTHON STORAGE BUCKET FUNCTION FINALIZED =========="
)
STORAGE_BUCKET_FUNCTION_METADATA_LOG = (
    "========== PYTHON STORAGE BUCKET FUNCTION METADATA =========="
)

PUBSUB_TOPIC = "test-topic"
START_DOCUMENT_NAME = "test/start"
TEST_BUCKET = "test-bucket"


@https.on_request()
def pyonreq(req: https.Request) -> https.Response:
    return https.Response("python_http_reaction")


@https.on_call()
def pyoncall(req: https.CallableRequest):
    return req.data


@db.on_value_written(
    reference=START_DOCUMENT_NAME,
)
def pyrtdbreaction(event: core.CloudEvent[db.Change[object]]):
    """
    This function will be triggered when a value is written to the database.
    """
    print(RTDB_LOG)
    return True


@pubsub.on_message_published(topic=PUBSUB_TOPIC)
def pypubsubreaction(event: core.CloudEvent[pubsub.MessagePublishedData]):
    print(PUBSUB_FUNCTION_LOG)
    return True


@storage.on_object_finalized()
def pyonobjectfinalized(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_FUNCTION_FINALIZED_LOG)


@storage.on_object_archived()
def pyobjectarchived(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_FUNCTION_ARCHIVED_LOG)


@storage.on_object_deleted()
def pyonobjectdeleted(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_FUNCTION_DELETED_LOG)


@storage.on_object_metadata_updated()
def pyonobjectmetadataupdated(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_FUNCTION_METADATA_LOG)


@storage.on_object_finalized(bucket=TEST_BUCKET)
def pybucketonobjectfinalized(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_BUCKET_FUNCTION_FINALIZED_LOG)


@storage.on_object_archived(bucket=TEST_BUCKET)
def pybucketobjectarchived(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_BUCKET_FUNCTION_ARCHIVED_LOG)


@storage.on_object_deleted(bucket=TEST_BUCKET)
def pybucketonobjectdeleted(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_BUCKET_FUNCTION_DELETED_LOG)


@storage.on_object_metadata_updated(bucket=TEST_BUCKET)
def pybucketonobjectmetadataupdated(event: core.CloudEvent[storage.StorageObjectData]):
    print(STORAGE_BUCKET_FUNCTION_METADATA_LOG)
