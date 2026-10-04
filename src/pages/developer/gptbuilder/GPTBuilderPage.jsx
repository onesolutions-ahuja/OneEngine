import { Workflow } from 'lucide-react'
import './GPTBuilderPage.css'

export default function GPTBuilderPage() {
  return (
    <section className="gptb-root" aria-label="GPT Builder">
      <header className="gptb-foundation-header">
        <div className="gptb-foundation-title">
          <span className="gptb-foundation-icon"><Workflow size={18}/></span>
          <span>
            <strong>GPT Builder</strong>
            <small>Independent Salesforce-parity workflow builder</small>
          </span>
        </div>
        <span className="gptb-foundation-badge">Isolated workspace</span>
      </header>
      <main className="gptb-foundation-canvas">
        <div className="gptb-foundation-card">
          <Workflow size={28}/>
          <strong>GPT Builder foundation ready</strong>
          <span>This workspace is intentionally separate from the existing Workflow Builder.</span>
        </div>
      </main>
    </section>
  )
}
