import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const files = [
  'src/pages/developer/Builder2Page.jsx',
  'src/pages/developer/Builder2Page.css',
  'src/pages/developer/Builder2AutoLayout.jsx',
  'src/pages/developer/Builder2GraphCanvas.jsx',
  'src/pages/developer/builder2Model.js',
  'src/pages/developer/builder2Runtime.js',
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
