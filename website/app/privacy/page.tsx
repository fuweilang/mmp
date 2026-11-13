import type { Metadata } from "next"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { companyName, siteName } from "@/lib/site"

export const metadata: Metadata = {
  title: `隐私政策 | ${siteName}`,
}

export default function PrivacyPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold">隐私政策</h1>
        <div className="mt-6 space-y-4 leading-8 text-muted">
          <p>
            本站由{companyName}提供，用来介绍{siteName}，并提供客户端下载和网页版、中台的入口。
          </p>
          <p>
            本站页面本身不收集账号和密码。下载安装包会访问 www.mmai.vip 上的文件。打开网页版或登录中台后，账号、对话和企业资料由对应产品按登录后的规则处理。
          </p>
          <p>如需了解账号数据，请登录后联系企业管理员。</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
