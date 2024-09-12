const { getDataConnect, queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'a',
  service: 'us-east',
  location: 'europe-north1'
};
exports.connectorConfig = connectorConfig;

function createPostRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return mutationRef(dcInstance, 'createPost', inputVars);
}
exports.createPostRef = createPostRef;
exports.createPost = function createPost(dcOrVars, vars) {
  return executeMutation(createPostRef(dcOrVars, vars));
};

function deletePostRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return mutationRef(dcInstance, 'deletePost', inputVars);
}
exports.deletePostRef = deletePostRef;
exports.deletePost = function deletePost(dcOrVars, vars) {
  return executeMutation(deletePostRef(dcOrVars, vars));
};

function createCommentRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return mutationRef(dcInstance, 'createComment', inputVars);
}
exports.createCommentRef = createCommentRef;
exports.createComment = function createComment(dcOrVars, vars) {
  return executeMutation(createCommentRef(dcOrVars, vars));
};

function getPostRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return queryRef(dcInstance, 'getPost', inputVars);
}
exports.getPostRef = getPostRef;
exports.getPost = function getPost(dcOrVars, vars) {
  return executeQuery(getPostRef(dcOrVars, vars));
};

function listPostsForUserRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return queryRef(dcInstance, 'listPostsForUser', inputVars);
}
exports.listPostsForUserRef = listPostsForUserRef;
exports.listPostsForUser = function listPostsForUser(dcOrVars, vars) {
  return executeQuery(listPostsForUserRef(dcOrVars, vars));
};

function listPostsOnlyIdRef(dc) {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return queryRef(dcInstance, 'listPostsOnlyId');
}
exports.listPostsOnlyIdRef = listPostsOnlyIdRef;
exports.listPostsOnlyId = function listPostsOnlyId(dc) {
  return executeQuery(listPostsOnlyIdRef(dc));
};

