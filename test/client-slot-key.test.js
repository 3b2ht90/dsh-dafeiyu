import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

test('client registers settings.plugin.item with a key for DSH keyed slots', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

  let capturedOptions
  const ctx = {
    slots: {
      inject(name, register) {
        assert.equal(name, 'settings.plugin.item')
        register()
      },
      register(options) {
        capturedOptions = options
        return {}
      },
    },
  }

  const React = {
    createElement() {},
    useEffect() {},
    useRef() { return { current: undefined } },
    useState() { return [] },
  }

  let client
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          client = factory((id) => {
            if (id === 'react') return React
            throw new Error(`unexpected require: ${id}`)
          })
        },
      },
    },
    console,
  }

  runInNewContext(source, sandbox)
  client.apply(ctx)

  assert.ok(capturedOptions, 'expected settings.plugin.item registration')
  assert.equal(capturedOptions.name, 'settings.plugin.item')
  assert.equal(capturedOptions.key, 'dsh-dafeiyu')
  assert.equal(capturedOptions.id, 'dsh-dafeiyu')
})
