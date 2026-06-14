import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Energon OS",
    short_name: "Energon",
    description: "Permissioned memory infrastructure for AI agent swarms.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/energonos.png",
        sizes: "1536x1024",
        type: "image/png",
      },
    ],
  };
}
