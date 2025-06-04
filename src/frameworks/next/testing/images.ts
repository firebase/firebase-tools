import type { ExportMarker, ImagesManifest } from "../interfaces";

export const exportMarkerWithoutImage: ExportMarker = {
  version: 1,
  hasExportPathMap: false,
  exportTrailingSlash: false,
  isNextImageImported: false,
};

export const exportMarkerWithImage: ExportMarker = {
  version: 1,
  hasExportPathMap: false,
  exportTrailingSlash: false,
  isNextImageImported: true,
};

export const imagesManifest: ImagesManifest = {
  version: 1,
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    path: "/_next/image",
    loader: "default",
    loaderFile: "",
    domains: [],
    disableStaticImages: false,
    minimumCacheTTL: 60,
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
    contentDispositionType: "inline",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "^(?:^(?:assets\\.vercel\\.com)$)$",
        port: "",
        pathname: "^(?:\\/image\\/upload(?:\\/(?!\\.)(?:(?:(?!(?:^|\\/)\\.).)*?)|$))$",
      },
    ],
    unoptimized: false,
    sizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840, 16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export const imagesManifestUnoptimized: ImagesManifest = {
  ...imagesManifest,
  images: {
    ...imagesManifest.images,
    unoptimized: true,
  },
};
