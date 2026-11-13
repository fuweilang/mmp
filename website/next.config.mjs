import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  turbopack: { root },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
