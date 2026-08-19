import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold">
              OC
            </div>
            <h1 className="text-lg font-semibold text-zinc-100">OpenCorp</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm text-zinc-400">
            <span className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-500">
              v0.1.0
            </span>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-24 pb-16">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-4 py-1.5 text-xs text-zinc-500">
              Local-first · Multi-agent · Open source
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-zinc-100 sm:text-5xl">
              Your AI company, running locally
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400">
              OpenCorp is an open-source multi-agent AI company simulator.
              Create AI employees, give them roles and tools, and watch them
              collaborate to accomplish objectives — all running on your own machine.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/company"
                className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-500"
              >
                Get Started
              </Link>
              <a
                href="https://github.com/opencorp/opencorp"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-800 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
              >
                GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              title="Multi-Agent"
              description="Create companies with multiple AI employees. Each agent has a role, skills, tools, and memory."
            />
            <FeatureCard
              title="Local-First"
              description="Everything runs on your machine. Your data stays yours. No cloud dependency required."
            />
            <FeatureCard
              title="Model Agnostic"
              description="Works with OpenRouter, OpenAI, Anthropic, Google, and local models via Ollama."
            />
            <FeatureCard
              title="Tool System"
              description="Agents can use the terminal, filesystem, browser, Git, and more to accomplish tasks."
            />
            <FeatureCard
              title="Skill Library"
              description="Reusable Markdown-based skill packages that teach agents how to perform specific work."
            />
            <FeatureCard
              title="Real-Time Visibility"
              description="Watch your agents think, communicate, use tools, and make progress in real time."
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-zinc-600">
          <span>OpenCorp — MIT License</span>
          <span>Built with Next.js + TypeScript + Tailwind CSS</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700">
      <h3 className="mb-2 font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}