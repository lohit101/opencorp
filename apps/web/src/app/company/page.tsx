import Link from 'next/link';

export default function CompanyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold">
                OC
              </div>
              <h1 className="text-lg font-semibold text-zinc-100">OpenCorp</h1>
            </Link>
          </div>
          <span className="text-sm text-zinc-500">Company Dashboard</span>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-zinc-100">Your Company</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Create and manage your AI company.
            </p>
          </div>

          {/* Empty state */}
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-800 py-24">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900">
              <span className="text-3xl">🏢</span>
            </div>
            <h3 className="mb-2 text-lg font-medium text-zinc-300">
              No company yet
            </h3>
            <p className="mb-8 max-w-md text-center text-sm text-zinc-500">
              Create your first AI company. Add agents, configure their roles,
              and give them an objective to accomplish.
            </p>
            <button
              disabled
              className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white opacity-50"
              title="Coming in Phase 2"
            >
              Create Company
            </button>
            <p className="mt-3 text-xs text-zinc-600">
              Company creation UI coming in the next development phase
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}