import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';
export const connectorConfig: ConnectorConfig;

export type TimestampString = string;

export type UUIDString = string;

export type Int64String = string;

export type DateString = string;


export interface Comment_Key {
  id: string;
  __typename?: 'Comment_Key';
}

export interface CreateCommentResponse {
  comment_insert: Comment_Key;
}

export interface CreateCommentVariables {
  id?: string | null;
  content?: string | null;
}

export interface CreatePostResponse {
  post_insert: Post_Key;
}

export interface CreatePostVariables {
  id?: string | null;
  content?: string | null;
}

export interface DeletePostResponse {
  post_delete?: Post_Key | null;
}

export interface DeletePostVariables {
  id: string;
}

export interface GetPostResponse {
  post?: {
    content: string;
    comments: ({
      id: string;
      content: string;
    } & Comment_Key)[];
  };
}

export interface GetPostVariables {
  id: string;
}

export interface ListPostsForUserResponse {
  posts: ({
    id: string;
    content: string;
  } & Post_Key)[];
}

export interface ListPostsForUserVariables {
  userId: string;
}

export interface ListPostsOnlyIdResponse {
  posts: ({
    id: string;
  } & Post_Key)[];
}

export interface Post_Key {
  id: string;
  __typename?: 'Post_Key';
}



/* Allow users to create refs without passing in DataConnect */
export function createPostRef(vars?: CreatePostVariables): MutationRef<CreatePostResponse, CreatePostVariables>;
/* Allow users to pass in custom DataConnect instances */
export function createPostRef(dc: DataConnect, vars?: CreatePostVariables): MutationRef<CreatePostResponse,CreatePostVariables>;

export function createPost(vars?: CreatePostVariables): MutationPromise<CreatePostResponse, CreatePostVariables>;
export function createPost(dc: DataConnect, vars?: CreatePostVariables): MutationPromise<CreatePostResponse,CreatePostVariables>;


/* Allow users to create refs without passing in DataConnect */
export function deletePostRef(vars: DeletePostVariables): MutationRef<DeletePostResponse, DeletePostVariables>;
/* Allow users to pass in custom DataConnect instances */
export function deletePostRef(dc: DataConnect, vars: DeletePostVariables): MutationRef<DeletePostResponse,DeletePostVariables>;

export function deletePost(vars: DeletePostVariables): MutationPromise<DeletePostResponse, DeletePostVariables>;
export function deletePost(dc: DataConnect, vars: DeletePostVariables): MutationPromise<DeletePostResponse,DeletePostVariables>;


/* Allow users to create refs without passing in DataConnect */
export function createCommentRef(vars?: CreateCommentVariables): MutationRef<CreateCommentResponse, CreateCommentVariables>;
/* Allow users to pass in custom DataConnect instances */
export function createCommentRef(dc: DataConnect, vars?: CreateCommentVariables): MutationRef<CreateCommentResponse,CreateCommentVariables>;

export function createComment(vars?: CreateCommentVariables): MutationPromise<CreateCommentResponse, CreateCommentVariables>;
export function createComment(dc: DataConnect, vars?: CreateCommentVariables): MutationPromise<CreateCommentResponse,CreateCommentVariables>;


/* Allow users to create refs without passing in DataConnect */
export function getPostRef(vars: GetPostVariables): QueryRef<GetPostResponse, GetPostVariables>;
/* Allow users to pass in custom DataConnect instances */
export function getPostRef(dc: DataConnect, vars: GetPostVariables): QueryRef<GetPostResponse,GetPostVariables>;

export function getPost(vars: GetPostVariables): QueryPromise<GetPostResponse, GetPostVariables>;
export function getPost(dc: DataConnect, vars: GetPostVariables): QueryPromise<GetPostResponse,GetPostVariables>;


/* Allow users to create refs without passing in DataConnect */
export function listPostsForUserRef(vars: ListPostsForUserVariables): QueryRef<ListPostsForUserResponse, ListPostsForUserVariables>;
/* Allow users to pass in custom DataConnect instances */
export function listPostsForUserRef(dc: DataConnect, vars: ListPostsForUserVariables): QueryRef<ListPostsForUserResponse,ListPostsForUserVariables>;

export function listPostsForUser(vars: ListPostsForUserVariables): QueryPromise<ListPostsForUserResponse, ListPostsForUserVariables>;
export function listPostsForUser(dc: DataConnect, vars: ListPostsForUserVariables): QueryPromise<ListPostsForUserResponse,ListPostsForUserVariables>;


/* Allow users to create refs without passing in DataConnect */
export function listPostsOnlyIdRef(): QueryRef<ListPostsOnlyIdResponse, undefined>;/* Allow users to pass in custom DataConnect instances */
export function listPostsOnlyIdRef(dc: DataConnect): QueryRef<ListPostsOnlyIdResponse,undefined>;

export function listPostsOnlyId(): QueryPromise<ListPostsOnlyIdResponse, undefined>;
export function listPostsOnlyId(dc: DataConnect): QueryPromise<ListPostsOnlyIdResponse,undefined>;


