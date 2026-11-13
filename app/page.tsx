export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8 md:px-10 md:py-12">
      <header className="flex items-center justify-between border-b border-line pb-6">
        <a href="/" className="text-lg font-bold tracking-tight">VERIF<span className="text-brand">/</span></a>
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted">Telegram group tools</span>
      </header>
      <section className="flex flex-1 flex-col justify-center py-16 md:py-24">
        <p className="mb-5 font-mono text-sm uppercase tracking-[0.16em] text-brand">Verification · moderation · control</p>
        <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Run your group.<br />Keep the rules yours.</h1>
        <p className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted">Configure verification, message limits, welcomes, rules, and keyword actions with Telegram inline controls. No AI in private settings.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a className="rounded-xl bg-brand px-5 py-3 font-semibold text-white" href="https://t.me/VERIF_bot?start=setup">Open VERIF in Telegram</a>
          <a className="rounded-xl border border-line bg-surface px-5 py-3 font-semibold" href="/api/telegram/webhook">Check bot endpoint</a>
        </div>
      </section>
      <section className="grid gap-4 border-t border-line py-8 md:grid-cols-3">
        {[['01', 'Group-owned settings', 'Every threshold and moderation action is scoped to the selected group.'], ['02', 'Inline control panel', 'Buttons edit one private control message instead of flooding the chat.'], ['03', 'Explicit policy', 'Configured limits drive automatic actions; AI is restricted to command interpretation and optional keyword review.']].map(([number, title, description]) => (
          <article key={number} className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-mono text-sm text-brand">{number}</p><h2 className="mt-3 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
