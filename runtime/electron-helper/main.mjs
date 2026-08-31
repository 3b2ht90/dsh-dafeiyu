// dsh-dafeiyu 3D 渲染端 —— Electron GUI 主进程
// 由 bridge.mjs(协议桥)通过本地 TCP 启动并接收状态消息,
// 将 DSH 工作状态消息(STATE/PULSE/TASK)转发给渲染进程驱动 3D 虎鲸情绪。
import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { connect } from 'node:net'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// ---------- 配置(与 dafeiyu manifest 语义对齐) ----------
const PROTOCOL_VERSION = 1
const STATE_TO_MOOD = {
  IDLE: 'idle',
  THINKING: 'needs-input',
  WORKING: 'working',
  WAITING: 'idle',
  SUCCESS: 'ready',
  ERROR: 'blocked',
  DISCONNECTED: 'idle',
}
const ACTIVITY_TO_MOOD = {
  searching: 'working',
  commanding: 'working',
  editing: 'working',
  testing: 'working',
  'using-tool': 'working',
}
const MOODS = {
  idle: { label: '空闲' },
  working: { label: '工作中' },
  'needs-input': { label: '需要输入' },
  ready: { label: '完成' },
  blocked: { label: '受阻' },
}

const scale = Math.min(1.6, Math.max(0.6, Number(process.env.DSH_DAFEIYU_SCALE) || 1))
const WINDOW_WIDTH = Math.round(238 * scale)
const WINDOW_HEIGHT = Math.round(260 * scale)

let win = null
let dragStartBounds = null

function stateToMood(message) {
  const state = message?.state
  if (message?.activity && ACTIVITY_TO_MOOD[message.activity]) return ACTIVITY_TO_MOOD[message.activity]
  return STATE_TO_MOOD[state] || 'idle'
}

function pushState(message) {
  if (!win || win.isDestroyed()) return
  const mood = stateToMood(message)
  const payload = {
    mood,
    state: message?.state || 'IDLE',
    message: message?.message || '',
    detail: message?.detail || '',
    task: message?.task || '',
    progress: message?.progress || null,
  }
  win.webContents.send('pet:state', payload)
}

function pushPulse(message) {
  if (!win || win.isDestroyed()) return
  const mood = stateToMood(message)
  const resume = message?.resumeState ? stateToMood({ state: message.resumeState, activity: message.resumeActivity }) : 'idle'
  win.webContents.send('pet:pulse', {
    mood,
    resume,
    message: message?.message || '',
    detail: message?.detail || '',
    ttlMs: message?.ttlMs || 2000,
  })
}

// ---------- stdin 协议桥 ----------
function createWindow() {
  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,   // 桌宠不显示在任务栏
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setMenu(null)
  win.loadFile(path.join(here, 'renderer', 'index.html'))
}

// 拖动窗口(修复 Windows 显示缩放棘轮 bug:锁定尺寸 + 相对总位移)
ipcMain.on('drag-start', () => {
  if (!win) return
  dragStartBounds = win.getBounds()
})
ipcMain.on('drag-move', (_event, dx, dy) => {
  if (!win || typeof dx !== 'number' || typeof dy !== 'number') return
  if (!dragStartBounds) dragStartBounds = win.getBounds()
  win.setBounds({
    x: Math.round(dragStartBounds.x + dx),
    y: Math.round(dragStartBounds.y + dy),
    width: dragStartBounds.width,
    height: dragStartBounds.height,
  })
})
ipcMain.on('drag-end', () => {
  dragStartBounds = null
})
ipcMain.on('pet:context-menu', (_event, cx, cy) => {
  if (!win) return
  const template = [
    { label: '🐋 3D 虎鲸 · dsh-dafeiyu', enabled: false },
    { label: '🖱 右键拖动旋转视角', enabled: false },
    { type: 'separator' },
    { label: '🔄 重置视角', click: () => win?.webContents.send('pet:reset-view') },
    { type: 'separator' },
    { label: '🗕 最小化', click: () => win?.minimize() },
    { label: '✕ 退出桌宠', click: () => app.quit() },
  ]
  Menu.buildFromTemplate(template).popup({ window: win, x: Math.round(cx), y: Math.round(cy) })
})

function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return
  switch (msg.kind) {
    case 'state':
      pushState(msg)
      break
    case 'pulse':
      pushPulse(msg)
      break
    case 'task':
      pushState({ ...msg, state: msg.state || 'WORKING' })
      break
    default:
      break
  }
}

// ---------- 启动 ----------
app.whenReady().then(() => {
  createWindow()

  // 窗口加载完成后通知渲染进程
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('pet:init', { scale })
  })

  // 连接协议桥(bridge.mjs 传入 --bridge=host:port)
  const bridgeArg = process.argv.find((a) => a.startsWith('--bridge='))
  if (!bridgeArg) return
  const [host, portText] = bridgeArg.slice('--bridge='.length).split(':')
  const port = Number(portText)
  if (!host || !port) return

  const socket = connect({ host, port })
  socket.setEncoding('utf8')
  const rl = createInterface({ input: socket })
  rl.on('line', (line) => {
    if (!line.trim()) return
    try { handleMessage(JSON.parse(line)) } catch { /* 忽略坏消息 */ }
  })
  socket.on('error', () => { /* bridge 退出时静默 */ })
  socket.on('close', () => { /* 保持窗口,等 bridge 重启 */ })
})

app.on('window-all-closed', () => app.quit())
