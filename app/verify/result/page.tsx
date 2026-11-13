export default async function VerifyResult({searchParams}:{searchParams:Promise<{status?:string}>}) {
  const {status}=await searchParams
  const succeeded=status==='verified'
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12"><section className="rounded-3xl border border-line bg-surface p-7"><p className="font-mono text-sm uppercase tracking-widest text-brand">VERIF / GROUP ACCESS</p><h1 className="mt-4 text-3xl font-semibold">{succeeded?'Verification complete':'Verification link'}</h1><p className="mt-4 leading-relaxed text-muted">{succeeded?'Your Telegram identity was confirmed. Return to the group to continue.':'Return to the group and request a new verification link.'}</p></section></main>
}
