declare module "stream-json/filters/pick.js" {
  import pick from "stream-json/src/filters/pick";
  export = pick;
}

declare module "stream-json/filters/filter.js" {
  import filter from "stream-json/src/filters/filter";
  export = filter;
}

declare module "stream-json/streamers/stream-array.js" {
  import streamArray from "stream-json/src/streamers/stream-array";
  export = streamArray;
}

declare module "stream-json/streamers/stream-object.js" {
  import streamObject from "stream-json/src/streamers/stream-object";
  export = streamObject;
}
