import type { Metadata } from "next"
import { LegacyAgentRedirect } from "@/components/legacy-agent-redirect"
import { siteName } from "@/lib/site"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL("https://www.mmai.vip"),
  title: `${siteName} | 下载客户端，或打开网页版`,
  description:
    "下载猛犸客户端，用专家处理手头的工作。同一账号也可以在浏览器里打开网页版智能体。",
  icons: { icon: "/favicon.png" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName,
    title: `${siteName} | 下载客户端，或打开网页版`,
    description:
      "下载猛犸客户端，用专家处理手头的工作。同一账号也可以在浏览器里打开网页版智能体。",
    url: "https://www.mmai.vip/",
    images: ["/logo.webp"],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="dns-prefetch" href="https://www.mmai.vip" />
      </head>
      <body className="min-h-screen antialiased">
        <LegacyAgentRedirect />
        {children}
      </body>
    </html>
  )
}
