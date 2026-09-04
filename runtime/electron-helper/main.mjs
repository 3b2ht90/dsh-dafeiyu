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

// 气泡宽度比例(0.6~1.2;1.0=窗口满宽,>1.0 时窗口同步加宽容纳更宽的气泡)
// 可右键菜单实时调整,或用环境变量 DSH_DAFEIYU_CARD_WIDTH 设默认
let cardWidth = Math.min(1.2, Math.max(0.6, Number(process.env.DSH_DAFEIYU_CARD_WIDTH) || 1))
const CARD_WIDTH_OPTIONS = [
  { id: 0.8, label: '80%' },
  { id: 0.9, label: '90%' },
  { id: 1.0, label: '100%' },
  { id: 1.1, label: '110%' },
  { id: 1.2, label: '120%' },
]

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
    // 窗口宽随气泡宽度:>100% 时窗口加宽(气泡伸出窗口边缘的部分被渲染,但窗口仍是透明可见区)
    width: Math.round(WINDOW_WIDTH * cardWidth),
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

// 应用气泡宽度:同步窗口宽度(保持水平居中)+ 通知渲染进程
function applyCardWidth(ratio) {
  const r = Math.min(1.2, Math.max(0.6, Number(ratio) || 1))
  cardWidth = r
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds()
    const newWidth = Math.round(WINDOW_WIDTH * r)
    if (bounds.width !== newWidth) {
      const centerX = bounds.x + bounds.width / 2
      win.setResizable(true) // resizable:false 时 setSize 不生效,临时放开
      win.setSize(newWidth, bounds.height)
      win.setPosition(Math.round(centerX - newWidth / 2), bounds.y)
      win.setResizable(false)
    }
  }
  win?.webContents.send('pet:card-width', r)
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
    {
      label: '📐 气泡宽度',
      submenu: CARD_WIDTH_OPTIONS.map((o) => ({
        label: o.label + (cardWidth === o.id ? ' ✓' : ''),
        type: 'radio',
        checked: cardWidth === o.id,
        click: () => applyCardWidth(o.id),
      })),
    },
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

  // 窗口加载完成后通知渲染进程(含气泡宽度)
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('pet:init', { scale, cardWidth })
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
