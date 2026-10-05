import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const files = [
  'src/pages/developer/gptbuilder/GPTBuilderPage.jsx',
  'src/pages/developer/gptbuilder/GPTBuilderElements.jsx',
  'src/pages/developer/gptbuilder/GPTBuilderDecision.jsx',
  'src/pages/developer/gptbuilder/GPTBuilder.css',
  'src/pages/settings/OneBuilder.jsx',
  'src/pages/developer/OneDeveloperPage.jsx',
  'src/navigation/routes.js',
]

const hash = createHash('sha256')
for (const file of files) {
  hash.update(file)
  hash.update('\0')
  hash.update(await readFile(file))
  hash.update('\0')
}
process.stdout.write(hash.digest('hex'))
