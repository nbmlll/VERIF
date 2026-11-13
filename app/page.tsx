export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8 md:px-10 md:py-12">
      <header className="flex items-center justify-between border-b border-foreground/10 pb-6">
        <a href="/" className="text-lg font-bold tracking-tight">VERIF<span className="text-brand">/</span></a>
        <span className="rounded-full border border-foreground/10 bg-surface px-3 py-1 text-sm text-muted">Telegram group tools</span>
      </header>
      <section className="flex flex-1 flex-col justify-center py-16 md:py-24">
        <p className="mb-5 font-mono text-sm uppercase tracking-[0.16em] text-brand">Verification · moderation · control</p>
        <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Run your group.<br />Keep the rules yours.</h1>
        <p className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted">Configure member verification, message limits, welcomes, rules, and keyword actions through Telegram&apos;s private inline control panel. Admin settings never use AI.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a className="rounded-xl bg-brand px-5 py-3 font-semibold text-surface" href="/api/telegram/webhook">Webhook status</a>
          <span className="rounded-xl border border-foreground/10 bg-surface px-5 py-3 text-sm text-muted">Add the configured bot as a group admin, then send /settings.</span>
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
