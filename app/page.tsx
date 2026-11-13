import { WebhookSetup } from './webhook-setup'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-4 md:px-10 md:py-6">
      <header className="flex items-center justify-between border-b border-foreground/10 pb-6">
        <a href="/" className="text-lg font-bold tracking-tight">VERIF<span className="text-brand">/</span></a>
        <span className="rounded-full border border-foreground/10 bg-surface px-3 py-1 text-sm text-muted">Telegram group tools</span>
      </header>
      <section className="flex flex-col justify-center py-4 md:py-6">
        <p className="mb-3 font-mono text-sm uppercase tracking-[0.16em] text-brand">Verification · moderation · control</p>
        <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl">Run your group.<br />Keep the rules yours.</h1>
        <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-muted">Configure verification, message limits, welcomes, and rules through Telegram&apos;s private inline control panel. Every action is validated against group settings and admin permissions.</p>
        <div className="mt-3">
          <WebhookSetup />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <span className="rounded-xl border border-foreground/10 bg-surface px-5 py-3 text-sm text-muted">Add the configured bot as a group admin, then send /settings.</span>
          <a className="px-1 py-3 text-sm font-medium text-brand underline-offset-4 hover:underline" href="/api/telegram/webhook">Check webhook endpoint</a>
        </div>
      </section>
      <section className="grid gap-4 border-t border-foreground/10 py-8 md:grid-cols-3">
        {[
          ['Group-owned settings','Thresholds and moderation choices are scoped to the selected group.'],
          ['Inline control panel','Buttons update one private control message instead of flooding the chat.'],
          ['Explicit policy','Configured limits drive automatic actions. AI is limited to group-admin commands and optional keyword review.'],
        ].map(([title,description])=>(
          <article key={title} className="rounded-2xl border border-foreground/10 bg-surface p-5">
            <h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
