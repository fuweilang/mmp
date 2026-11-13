import { ActionPair, DownloadFiles } from "@/components/actions"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { agentPoints, consoleLoginUrl, experts, platformItems, webAppUrl } from "@/lib/site"

export default function HomePage() {
  return (
    <div id="top">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-24">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              打开就能用专家干活
            </h1>
            <p className="mt-5 max-w-md text-lg leading-8 text-muted">
              猛犸客户端装在电脑上。网页版是同一套智能体，浏览器里也能直接打开。
            </p>
            <ActionPair className="mt-8" />
            <p className="mt-4 text-sm text-muted">同一账号，网页版也能直接打开。</p>
          </div>
          <img
            src="/shots/gallery.webp"
            srcSet="/shots/gallery-800.webp 800w, /shots/gallery.webp 1440w"
            sizes="(min-width: 1024px) 640px, 100vw"
            width={1440}
            height={820}
            alt="猛犸客户端里的智能体广场"
            fetchPriority="high"
            decoding="async"
            className="h-auto w-full rounded-2xl border border-line shadow-[0_18px_50px_rgba(74,83,163,0.12)]"
          />
        </section>

        <section id="download" className="border-t border-line bg-brand-soft/60">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-line bg-white p-8">
              <p className="text-sm font-medium text-brand">主推</p>
              <h2 className="mt-2 text-2xl font-semibold">下载客户端</h2>
              <p className="mt-3 leading-7 text-muted">
                装在自己的电脑上，用专家处理本机上的文件和工作。
              </p>
              <div className="mt-6">
                <DownloadFiles />
              </div>
            </article>
            <article className="rounded-2xl border border-line bg-white p-8">
              <p className="text-sm font-medium text-brand">同一套智能体</p>
              <h2 className="mt-2 text-2xl font-semibold">浏览器打开网页版</h2>
              <p className="mt-3 leading-7 text-muted">
                不安装也能用。网页版和客户端是同一批专家、同一个账号。登录后就能开始对话。
              </p>
              <a
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-brand bg-white px-5 py-3 text-sm font-semibold text-brand hover:bg-brand-soft"
                href={webAppUrl}
              >
                打开网页版
              </a>
            </article>
          </div>
        </section>

        <section id="agent" className="below-fold mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold">打开之后会看到这些</h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            客户端和网页版是同一套界面。首屏那张是广场，下面这张是对话页。
          </p>
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <ul className="grid gap-4">
              {agentPoints.map((point) => (
                <li key={point.title} className="rounded-2xl border border-line p-5">
                  <h3 className="font-semibold">{point.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{point.text}</p>
                </li>
              ))}
            </ul>
            <img
              src="/shots/chat.webp"
              srcSet="/shots/chat-800.webp 800w, /shots/chat.webp 1440w"
              sizes="(min-width: 1024px) 720px, 100vw"
              width={1440}
              height={774}
              alt="猛犸智能体的对话页，会话在工作区里，输入框可以挂上企业知识库"
              loading="lazy"
              decoding="async"
              className="h-auto w-full rounded-2xl border border-line"
            />
          </div>
        </section>

        <section className="below-fold mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="text-2xl font-semibold">打开之后就能用这些专家</h2>
          <p className="mt-3 text-muted">客户端和网页版里都是这一批。</p>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {experts.map((expert) => (
              <li key={expert.name} className="rounded-2xl border border-line p-4">
                <img
                  src={expert.avatar}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="h-14 w-14 rounded-full object-cover"
                />
                <p className="mt-3 text-sm font-semibold">{expert.name}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{expert.line}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="platform" className="below-fold border-y border-line bg-brand-soft/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold">企业怎么管，看中台</h2>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              客户端和网页版用的是同一个企业账号。人、权限、资料和 AI 币都在中台。平台管理员也在这里配置专家、技能、模型和各企业钱包。
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {platformItems.map((item) => (
                <li key={item.title} className="rounded-2xl border border-line bg-white p-5">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
                </li>
              ))}
            </ul>
            <a
              className="mt-8 inline-flex text-sm font-semibold text-brand hover:text-brand-hover"
              href={consoleLoginUrl}
            >
              登录中台
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
