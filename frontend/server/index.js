import 'dotenv/config'
import os from 'os'
import express from 'express'
import cors from 'cors'
import { signTencentRequest } from './tencent-sign.js'

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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

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

/** OpenAI 兼容对话（非流式） */
async function callOpenAIChat(messages, model, baseUrl, apiKey, temperature = 0.2) {
  const key = apiKey || OPENAI_API_KEY
  if (!key) throw new Error('未配置 OPENAI_API_KEY')

  const response = await fetch(`${baseUrl || OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: temperature ?? 0.2,
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'OpenAI 请求失败')
  return data.choices[0].message.content
}

/** OpenAI 兼容流式对话，通过 SSE 转发 delta */
async function streamOpenAIChat(res, messages, model, baseUrl, apiKey, temperature = 0.2) {
  const key = apiKey || OPENAI_API_KEY
  if (!key) throw new Error('未配置 API Key')

  const response = await fetch(`${baseUrl || OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: temperature ?? 0.2,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `请求失败 (${response.status})`)
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') {
        res.write('data: [DONE]\n\n')
        continue
      }
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`)
        }
      } catch {
        /* 忽略无法解析的行 */
      }
    }
  }

  res.write('data: [DONE]\n\n')
  res.end()
}

/** 混元对话（hunyuanlite 产品） */
async function callHunyuanChat(messages, model) {
  if (!SECRET_ID || !SECRET_KEY) {
    return mockChatReply(messages)
  }

  const msgs = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ Role: m.role === 'assistant' ? 'assistant' : 'user', Content: m.content }))

  const system = messages.find((m) => m.role === 'system')?.content

  const payload = {
    Model: model || 'hunyuan-lite',
    Messages: msgs,
  }
  if (system) payload.System = system

  try {
    const data = await callTencentApi('ChatCompletions', payload, 'hunyuan')
    return data.Response.Choices[0].Message.Content
  } catch (e) {
    return mockChatReply(messages)
  }
}

function mockChatReply(messages) {
  const last = messages.filter((m) => m.role === 'user').pop()?.content || ''
  return `【演示模式】收到：「${last.slice(0, 100)}」\n\n请在「模型配置」中填写对应模型的 API Key，或为腾讯云模型配置 .env 密钥。`
}

const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  bailian: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  bytedance: 'https://ark.cn-beijing.volces.com/api/v3',
  minimax: 'https://api.minimax.chat/v1',
}

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  'openai',
  'deepseek',
  'anthropic',
  'zhipu',
  'custom',
  'qwen',
  'bailian',
  'doubao',
  'bytedance',
  'yuanbao',
  'gemini',
  'grok',
  'meta',
  'minimax',
  'nanobanana',
  'kling',
])

/** 文本对话（非流式，兼容旧客户端） */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, provider, baseUrl, apiKey, temperature } = req.body

    let content
    if (provider === 'tencent') {
      content = await callHunyuanChat(messages, model)
    } else if (OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
      const url = baseUrl || PROVIDER_BASE_URLS[provider] || OPENAI_BASE_URL
      content = await callOpenAIChat(messages, model, url, apiKey, temperature)
    } else if (OPENAI_API_KEY) {
      content = await callOpenAIChat(messages, model, baseUrl, apiKey, temperature)
    } else {
      content = mockChatReply(messages)
    }

    res.json({ content })
  } catch (err) {
    console.error('[chat]', err)
    res.status(500).json({ error: err.message })
  }
})

/** 文本对话（SSE 流式，DeepSeek / OpenAI 兼容接口） */
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, model, provider, baseUrl, apiKey, temperature } = req.body

    if (provider === 'tencent') {
      const content = await callHunyuanChat(messages, model)
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.write(`data: ${JSON.stringify({ delta: content })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    if (OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
      const url = baseUrl || PROVIDER_BASE_URLS[provider] || OPENAI_BASE_URL
      await streamOpenAIChat(res, messages, model, url, apiKey, temperature)
      return
    }

    if (OPENAI_API_KEY) {
      await streamOpenAIChat(res, messages, model, baseUrl, apiKey, temperature)
      return
    }

    const content = mockChatReply(messages)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.write(`data: ${JSON.stringify({ delta: content })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('[chat/stream]', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
})

/** 图片生成 */
app.post('/api/image', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ error: '缺少 prompt' })

    if (SECRET_ID && SECRET_KEY) {
      try {
        const data = await callTencentApi(
          'TextToImage',
          { Prompt: prompt, RspImgType: 'url' },
          'aiart',
        )
        const url = data.Response?.ResultImage
        if (url) return res.json({ url, message: '图片生成成功' })
      } catch (e) {
        console.warn('[image] Tencent aiart fallback:', e.message)
      }
    }

    res.json({
      message: `【演示】已收到图片描述：「${prompt.slice(0, 80)}…」\n配置腾讯云 aiart 或图片 API 后可生成真实图片。`,
      url: `https://picsum.photos/seed/${encodeURIComponent(prompt.slice(0, 20))}/512/512`,
    })
  } catch (err) {
    console.error('[image]', err)
    res.status(500).json({ error: err.message })
  }
})

/** 视频生成（任务占位） */
app.post('/api/video', async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ error: '缺少 prompt' })

    const jobId = `video-${Date.now()}`
    res.json({
      jobId,
      status: 'WAIT',
      message: `【演示】视频生成任务已创建：「${prompt.slice(0, 60)}…」\n接入混元/可灵等视频 API 后将返回真实视频地址。`,
    })
  } catch (err) {
    console.error('[video]', err)
    res.status(500).json({ error: err.message })
  }
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

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(SECRET_ID && SECRET_KEY),
    openai: Boolean(OPENAI_API_KEY),
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
