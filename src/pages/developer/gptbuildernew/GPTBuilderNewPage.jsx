import './GPTBuilderNewPage.css'

const BASELINE = [
  ['Flow types', '18 discovered', 'Baseline expansion in progress'],
  ['Elements', '17 discovered', 'Exact parity required'],
  ['Resources', '9 discovered', 'Exact parity required'],
  ['Screen components', '45 captured / 46 indicated', 'Reconciliation required'],
  ['Lifecycle', 'Save · Version · Activate · Debug · Tests', 'Exact parity required'],
  ['Visual system', 'Salesforce Flow Builder', 'Exact parity required'],
]

export default function GPTBuilderNewPage() {
  return (
    <main className="gptbuildernew" data-testid="gptbuildernew">
      <header className="gptbuildernew__header">
        <div>
          <span className="gptbuildernew__eyebrow">Salesforce parity workspace</span>
          <h1>GPT Builder New</h1>
          <p>Isolated from the current GPT Builder. Salesforce-equivalent UI, behaviour, validation, runtime and lifecycle are the acceptance baseline.</p>
        </div>
        <strong className="gptbuildernew__badge">100% parity target</strong>
      </header>
      <section className="gptbuildernew__baseline" aria-label="Salesforce parity baseline">
        {BASELINE.map(([name, scope, status]) => (
          <article key={name}>
            <span>{name}</span>
            <b>{scope}</b>
            <small>{status}</small>
          </article>
        ))}
      </section>
      <section className="gptbuildernew__stage">
        <h2>Baseline locked</h2>
        <p>The existing GPT Builder remains untouched. New parity implementation will be built and verified here before any replacement decision.</p>
      </section>
    </main>
  )
}
