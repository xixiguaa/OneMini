import 'dotenv/config'
import os from 'os'
import express from 'express'
import cors from 'cors'
import { signTencentRequest } from './tencent-sign.js'
import { getModelCatalog, SUPPORTED_CAPABILITIES } from './modelCatalog.js'

function getLanAddresses() {
  const addrs = []
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const cfg of ifaces ?? []) {
      if (cfg.family === 'IPv4' && !cfg.internal) addrs.push(cfg.address)
    }
  }
  return addrs
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '20mb' }))

const SECRET_ID = process.env.TENCENT_SECRET_ID
const SECRET_KEY = process.env.TENCENT_SECRET_KEY
const REGION = process.env.TENCENT_REGION || 'ap-guangzhou'

function requireCredentials(res) {
  if (!SECRET_ID || !SECRET_KEY) {
    res.status(500).json({
      error: '未配置腾讯云密钥',
      message: '请在 .env 中设置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY',
    })
    return false
  }
  return true
}

async function callTencentApi(action, payload, service = 'ai3d') {
  const { url, headers, body } = signTencentRequest({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    region: REGION,
    service,
    action,
    payload,
  })

  const response = await fetch(url, { method: 'POST', headers, body })
  const data = await response.json()
  if (data.Response?.Error) {
    const err = new Error(data.Response.Error.Message)
    err.data = data
    throw err
  }
  return data
}

/** 对话已迁移至 Python 平台 API（密钥仅存服务端） */
app.post('/api/chat', (_req, res) => {
  res.status(410).json({
    error: '已迁移',
    message: '请使用 POST /api/platform/agent/chat（由 Vite 代理至 Python 后端）',
  })
})

app.post('/api/chat/stream', (_req, res) => {
  res.status(410).json({
    error: '已迁移',
    message: '请使用 POST /api/platform/agent/chat/stream',
  })
})

/** 视频生成（已迁移至 Python 平台 API） */
app.post('/api/video', (_req, res) => {
  res.status(410).json({
    error: '已迁移',
    message: '请使用 POST /api/platform/agent/video（由 Vite 代理至 Python 后端）',
  })
})

/** 提交混元生3D专业版任务 */
app.post('/api/submit', async (req, res) => {
  if (!requireCredentials(res)) return
  try {
    const { prompt, imageUrl, imageBase64, generateType, enablePBR, faceCount, model } = req.body
    const payload = {}
    if (prompt) payload.Prompt = prompt
    if (imageUrl) payload.ImageUrl = imageUrl
    if (imageBase64) payload.ImageBase64 = imageBase64
    if (generateType) payload.GenerateType = generateType
    if (enablePBR !== undefined) payload.EnablePBR = enablePBR
    if (faceCount) payload.FaceCount = faceCount
    if (model && model !== 'rapid') payload.Model = model

    const data = await callTencentApi('SubmitHunyuanTo3DProJob', payload)
    res.json(data.Response)
  } catch (err) {
    console.error('[submit]', err)
    res.status(500).json({ error: err.message, detail: err.data })
  }
})

app.post('/api/query', async (req, res) => {
  if (!requireCredentials(res)) return
  try {
    const { jobId } = req.body
    if (!jobId) return res.status(400).json({ error: '缺少 jobId' })
    const data = await callTencentApi('QueryHunyuanTo3DProJob', { JobId: jobId })
    res.json(data.Response)
  } catch (err) {
    console.error('[query]', err)
    res.status(500).json({ error: err.message, detail: err.data })
  }
})

app.post('/api/submit-rapid', async (req, res) => {
  if (!requireCredentials(res)) return
  try {
    const { prompt, imageUrl, imageBase64 } = req.body
    const payload = {}
    if (prompt) payload.Prompt = prompt
    if (imageUrl) payload.ImageUrl = imageUrl
    if (imageBase64) payload.ImageBase64 = imageBase64
    const data = await callTencentApi('SubmitHunyuanTo3DRapidJob', payload)
    res.json(data.Response)
  } catch (err) {
    console.error('[submit-rapid]', err)
    res.status(500).json({ error: err.message, detail: err.data })
  }
})

app.post('/api/query-rapid', async (req, res) => {
  if (!requireCredentials(res)) return
  try {
    const { jobId } = req.body
    if (!jobId) return res.status(400).json({ error: '缺少 jobId' })
    const data = await callTencentApi('QueryHunyuanTo3DRapidJob', { JobId: jobId })
    res.json(data.Response)
  } catch (err) {
    console.error('[query-rapid]', err)
    res.status(500).json({ error: err.message, detail: err.data })
  }
})

/** 模型展示目录（Phase 1：分类、标签、中文名） */
app.get('/api/models/catalog', (req, res) => {
  const provider = String(req.query.provider || '').trim()
  const capability = String(req.query.capability || 'chat').trim()

  if (!provider) {
    return res.status(400).json({ error: '缺少 provider 参数' })
  }
  if (!SUPPORTED_CAPABILITIES.includes(capability)) {
    return res.status(400).json({ error: `不支持的能力类型: ${capability}` })
  }

  res.json(getModelCatalog(provider, capability))
})

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(SECRET_ID && SECRET_KEY),
    region: REGION,
  })
})

const HOST = process.env.HOST || '0.0.0.0'

app.listen(PORT, HOST, () => {
  console.log(`OneMini Agent API 运行于 http://localhost:${PORT}`)
  const lan = getLanAddresses()
  if (lan.length) {
    console.log(`  局域网访问: ${lan.map((ip) => `http://${ip}:${PORT}`).join('  ')}`)
  }
  console.log('  说明: 前端 dev 请用 Vite 的 Network 地址；公网需自行做端口映射或内网穿透')
})
