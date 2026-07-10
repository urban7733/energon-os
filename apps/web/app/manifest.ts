import type { MetadataRoute } from "next";
import { site } from "../lib/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Energon OS",
    short_name: "Energon",
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0b",
    theme_color: "#0b0b0b",
    icons: [
      {
        src: "/energonos.png",
        sizes: "1536x1024",
        type: "image/png",
      },
    ],
  };
}
