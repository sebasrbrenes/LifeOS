import type { MetadataRoute } from "next";

/** Installable PWA (spec §29): standalone, dark, opens on the dashboard. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "Life OS",
    short_name: "Life OS",
    description:
      "Sistema personal de métricas: dónde estás, cómo ejecutas y qué atacar a continuación.",
    lang: "es",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Semana", url: "/week" },
      { name: "Métricas", url: "/metrics" },
    ],
  };
}
