import type { Metadata } from "next"
import { siteName } from "@/lib/site"
import "./globals.css"

export const metadata: Metadata = {
  title: `${siteName} | 下载客户端，或打开网页版`,
  description:
    "下载猛犸客户端，用专家处理手头的工作。同一账号也可以在浏览器里打开网页版智能体。",
  icons: { icon: "/favicon.png" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="dns-prefetch" href="https://www.mmai.vip" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
