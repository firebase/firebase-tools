import { getDataConnect, queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'a',
  service: 'us-east',
  location: 'europe-north1'
};

export function createPostRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return mutationRef(dcInstance, 'createPost', inputVars);
}
export function createPost(dcOrVars, vars) {
  return executeMutation(createPostRef(dcOrVars, vars));
}
export function deletePostRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return mutationRef(dcInstance, 'deletePost', inputVars);
}
export function deletePost(dcOrVars, vars) {
  return executeMutation(deletePostRef(dcOrVars, vars));
}
export function createCommentRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return mutationRef(dcInstance, 'createComment', inputVars);
}
export function createComment(dcOrVars, vars) {
  return executeMutation(createCommentRef(dcOrVars, vars));
}
export function getPostRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return queryRef(dcInstance, 'getPost', inputVars);
}
export function getPost(dcOrVars, vars) {
  return executeQuery(getPostRef(dcOrVars, vars));
}
export function listPostsForUserRef(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return queryRef(dcInstance, 'listPostsForUser', inputVars);
}
export function listPostsForUser(dcOrVars, vars) {
  return executeQuery(listPostsForUserRef(dcOrVars, vars));
}
export function listPostsOnlyIdRef(dc) {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  if('_useGeneratedSdk' in dcInstance) {
    dcInstance._useGeneratedSdk();
  } else {
    console.error('Please update to the latest version of the Data Connect SDK by running `npm install firebase@dataconnect-preview`.');
  }
  return queryRef(dcInstance, 'listPostsOnlyId');
}
export function listPostsOnlyId(dc) {
  return executeQuery(listPostsOnlyIdRef(dc));
}
