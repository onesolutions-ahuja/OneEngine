import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CORE_DATABASE_MIGRATION_KEYS, runMigrations } from '../server/database/migrations.js'

test('warm migration check uses one applied-key read and no per-migration transactions', async () => {
  const queries = []
  const appliedKeys = [...CORE_DATABASE_MIGRATION_KEYS, 'test_already_applied']
  const client = {
    async query(sql, params = []) {
      const text = String(sql)
      queries.push({ text, params })
      if (text.includes('SELECT migration_key FROM schema_migrations') && !text.includes('WHERE migration_key=$1')) {
        return { rows: appliedKeys.map((migration_key) => ({ migration_key })) }
      }
      return { rows: [] }
    },
  }

  let ran = false
  await runMigrations(client, [{
    key: 'test_already_applied',
    version: '999',
    name: 'Warm migration query-count regression',
    up: async () => { ran = true },
  }])

  assert.equal(ran, false)
  assert.equal(queries.filter(({ text }) => text.trim() === 'BEGIN').length, 0)
  assert.equal(queries.filter(({ text }) => text.includes('WHERE migration_key=$1')).length, 0)
  assert.equal(
    queries.filter(({ text }) => text.includes('SELECT migration_key FROM schema_migrations') && !text.includes('WHERE migration_key=$1')).length,
    1,
  )
})
