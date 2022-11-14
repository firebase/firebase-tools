export interface ExportMarker {
  version: number;
  hasExportPathMap: boolean;
  exportTrailingSlash: boolean;
  isNextImageImported: boolean;
}

export interface ImageManifest {
  version: number;
  images: {
    unoptimized: boolean;
  };
}
