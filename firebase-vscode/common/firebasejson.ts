export interface FirebaseJSONHosting {
    public?: string;
    ignore?: string[];
    rewrites?: string[];
  }
  
export interface FirebaseJSON {
    hosting?: FirebaseJSONHosting;
}