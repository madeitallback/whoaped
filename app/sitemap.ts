import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ["", "/leaderboard", "/methodology"].map((path, index) => ({ url: `https://www.whoaped.xyz${path}`, lastModified, changeFrequency: index === 2 ? "monthly" as const : "daily" as const, priority: index === 0 ? 1 : .8 }));
}
