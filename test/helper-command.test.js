import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { defaultCmdExe, resolveHelperLaunch } from '../src/helper-process.js'

const bundledPath = '/package/runtime/bin/win32-x64/dsh-dafeiyu-helper.exe'
const helperPath = '/package/runtime/helper.py'

function resolve(overrides = {}) {
  return resolveHelperLaunch({
    platform: 'linux',
    isWslEnv: false,
    bundledPath,
    helperPath,
    fileExists: () => true,
    windowsPath: () => 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe',
    ...overrides,
  })
}

test('native Windows launches the bundled x64 helper directly', () => {
  assert.deepEqual(resolve({ platform: 'win32' }), { command: bundledPath, args: [] })
})

test('WSL visual mode uses an absolute cmd.exe path, not the bare name on PATH', () => {
  // cmd.exe is typically not on the WSL PATH; the plugin must use the Windows
  // absolute path resolved through wslpath so it works on every WSL install.
  assert.deepEqual(resolve({ isWslEnv: true, cmdExe: () => '/mnt/c/Windows/System32/cmd.exe' }), {
    command: '/mnt/c/Windows/System32/cmd.exe',
    args: ['/d', '/c', 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe'],
  })
})

test('WSL visual mode falls back to the bare cmd.exe if the absolute path cannot be resolved', () => {
  assert.deepEqual(resolve({ isWslEnv: true, cmdExe: () => 'cmd.exe' }), {
    command: 'cmd.exe',
    args: ['/d', '/c', 'C:\\package\\runtime\\bin\\win32-x64\\dsh-dafeiyu-helper.exe'],
  })
})

test('defaultCmdExe returns an absolute cmd.exe path on this WSL host', () => {
  const resolved = defaultCmdExe()
  assert.ok(typeof resolved === 'string' && resolved.length > 0)
  assert.ok(existsSync(resolved), `resolved cmd.exe must exist: ${resolved}`)
})

test('WSL headless mode stays on Linux Python for Linux event-log paths', () => {
  assert.deepEqual(resolve({ isWslEnv: true, headless: true }), {
    command: 'python3',
    args: [helperPath],
  })
})

test('ordinary Linux does not attempt Windows interop', () => {
  assert.deepEqual(resolve(), { command: 'python3', args: [helperPath] })
})

test('missing bundled helper falls back to the configured Python', () => {
  assert.deepEqual(resolve({
    isWslEnv: true,
    fileExists: () => false,
    pythonEnv: '/opt/dsh/python',
  }), {
    command: '/opt/dsh/python',
    args: [helperPath],
  })
})
