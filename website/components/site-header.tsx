import { ActionPair } from "@/components/actions"
import { siteName } from "@/lib/site"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-6">
          <a className="flex items-center gap-3" href="#top">
            <img
              src="/logo.webp"
              alt=""
              width={36}
              height={36}
              decoding="async"
              className="h-9 w-9 rounded-full"
            />
            <span className="text-base font-semibold tracking-tight">{siteName}</span>
          </a>
          <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
            <a className="hover:text-ink" href="#agent">智能体</a>
            <a className="hover:text-ink" href="#platform">中台</a>
          </nav>
        </div>
        <ActionPair />
      </div>
    </header>
  )
}
