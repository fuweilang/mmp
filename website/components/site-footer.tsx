import { DownloadFiles } from "@/components/actions"
import { companyName, icpNumber, icpUrl } from "@/lib/site"

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
        <div>
          <h2 className="text-base font-semibold">下载客户端</h2>
          <div className="mt-4">
            <DownloadFiles />
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            {companyName}
            <span className="mx-2 text-line">|</span>
            <a className="hover:text-brand" href={icpUrl}>
              {icpNumber}
            </a>
          </p>
          <a className="hover:text-brand" href="/privacy">
            隐私政策
          </a>
        </div>
      </div>
    </footer>
  )
}
