import Studio from "./components/Studio";

export default function App() {
  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none fixed inset-0 glow-aura" />
      <div className="relative mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-[42px]">
            AI Chat Converter{" "}
            <span className="text-white/40">/ Electron</span>
          </h1>
          <p className="mt-2 text-[14.5px] text-white/50">
            HTML salvo → Markdown limpo · motor Python via Electron IPC
          </p>
        </header>
        <Studio />
      </div>
    </div>
  );
}
