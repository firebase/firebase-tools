export class ListItem {
  name: string;
  bucket: string;
  constructor(name: string, bucket: string) {
    this.name = name;
    this.bucket = bucket;
  }
}

export class ListResponse {
  prefixes: string[];
  items: ListItem[];
  nextPageToken: string | undefined;

  constructor(prefixes: string[], items: ListItem[], nextPageToken: string | undefined) {
    this.prefixes = prefixes;
    this.items = items;
    this.nextPageToken = nextPageToken;
  }
}
