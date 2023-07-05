/** Error that signals that a resource could not be found */
export class NotFoundError extends Error {}

/** Error that signals that a necessary permission was lacking. */
export class ForbiddenError extends Error {}

/** Error that signals an invalid Url trying to be accessed*/
export class BadRequestError extends Error{}
