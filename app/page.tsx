export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-semibold text-balance">Actor JSON Exporter</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground text-pretty">
          This is a Foundry VTT module. Install it in Foundry to export actor data as JSON. The
          module source lives in the <code>scripts/</code>, <code>templates/</code>, and{" "}
          <code>styles/</code> directories along with <code>module.json</code>.
        </p>
      </div>
    </main>
  )
}
