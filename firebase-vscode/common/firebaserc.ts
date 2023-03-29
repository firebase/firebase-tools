export interface FirebaseRCProjects {
  default: string;
  [index: string]: string;
}

export interface FirebaseRC {
  projects?: FirebaseRCProjects;
}
