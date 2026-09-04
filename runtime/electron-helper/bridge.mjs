// dsh-dafeiyu 3D 渲染端 —— 协议桥(纯 Node 进程)
// 由 dafeiyu 插件(src/helper-process.js)spawn,通过 stdin/stdout 承载原协议;
// 再把状态消息经本地 TCP 转发给 Electron GUI 窗口进程(渲染 3D 虎鲸)。
// 启动方式: electron.exe(ELECTRON_RUN_AS_NODE=1) 或 node.exe 运行本文件
import { createInterface } from 'node:readline'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const PROTOCOL_VERSION = 1
// 探测 electron 可执行文件:环境变量优先,其次常见安装位置(whale-pet 桌宠附带)
const ELECTRON_CANDIDATES = [
  process.env.DSH_DAFEIYU_ELECTRON,
  'C:\\Users\\Administrator\\whale-pet\\node_modules\\electron\\dist\\electron.exe',
].filter(Boolean)
const ELECTRON_EXE = ELECTRON_CANDIDATES.find((p) => existsSync(p))
if (!ELECTRON_EXE) {
  console.error('[dafeiyu-bridge] 找不到 electron 可执行文件,请设置 DSH_DAFEIYU_ELECTRON 环境变量')
  process.exit(2)
}

let stdoutAlive = true
function send(obj) {
  if (!stdoutAlive) return
  try { process.stdout.write(JSON.stringify(obj) + '\n') } catch { stdoutAlive = false }
}

// ---------- TCP 状态转发 ----------
let guiSocket = null
let gui = null

function forward(kind, payload) {
  if (guiSocket && !guiSocket.destroyed) {
    guiSocket.write(JSON.stringify({ kind, ...payload }) + '\n')
  }
}

function closeAll() {
  try { if (guiSocket && !guiSocket.destroyed) { guiSocket.end(); guiSocket.destroy() } } catch {}
  guiSocket = null
  if (gui) { try { gui.kill() } catch {} gui = null }
}

function startGui() {
  if (gui) return
  const main = path.join(here, 'main.mjs')
  const args = [main, `--bridge=127.0.0.1:${bridgePort}`]
  // 注意:gui 进程必须去掉 ELECTRON_RUN_AS_NODE,以正常 GUI 模式运行
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  gui = spawn(ELECTRON_EXE, args, { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  gui.on('error', (err) => { console.error('[dafeiyu-bridge] gui spawn error: ' + err.message) })
  gui.stderr.on('data', (d) => {
    const s = String(d).trim()
    if (s && !s.includes('Electron Security Warning')) console.error('[dafeiyu-gui] ' + s)
  })
  gui.on('exit', () => { gui = null })
}

let bridgePort = 0
const server = createServer((socket) => {
  guiSocket = socket
  socket.on('error', () => { /* GUI 断开时忽略 */ })
  socket.on('close', () => { if (guiSocket === socket) guiSocket = null })
})
server.on('error', () => { /* 端口冲突时忽略 */ })
server.listen(0, '127.0.0.1', () => {
  bridgePort = server.address().port
  startGui()
})

// ---------- stdin 协议 ----------
function handleMessage(line) {
  let msg = null
  try { msg = JSON.parse(line) } catch {
    send({ protocolVersion: PROTOCOL_VERSION, kind: 'pong', error: 'bad-json' })
    return
  }
  if (msg?.protocolVersion !== PROTOCOL_VERSION) {
    send({ protocolVersion: PROTOCOL_VERSION, kind: 'pong', error: 'bad-version' })
    return
  }
  switch (msg.kind) {
    case 'hello':
      send({ protocolVersion: PROTOCOL_VERSION, kind: 'ready', timestamp: Date.now() })
      break
    case 'ping':
      send({ protocolVersion: PROTOCOL_VERSION, kind: 'pong', timestamp: Date.now() })
      break
    case 'state':
      forward('state', msg)
      break
    case 'pulse':
      forward('pulse', msg)
      break
    case 'task':
      forward('state', { ...msg, state: msg.state || 'WORKING' })
      break
    case 'tasks':
      // 新版协议:多任务进度,取最优先的一个展示为 WORKING/THINKING
      forward('state', { ...msg, state: msg.state || 'WORKING' })
      break
    case 'config':
      // 配置类消息不改变形象状态;仅回执确认已接收
      break
    case 'shutdown':
      send({ protocolVersion: PROTOCOL_VERSION, kind: 'closed', timestamp: Date.now() })
      closeAll()
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 500)
      break
    default:
      break
  }
}

// 启动即回复 ready(协议要求)
send({ protocolVersion: PROTOCOL_VERSION, kind: 'ready', timestamp: Date.now() })

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => { if (line.trim()) handleMessage(line) })
rl.on('close', () => {
  closeAll()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 500)
})
