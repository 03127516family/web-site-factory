// ---------- DeepSeek 客户端（OpenAI 兼容；单次 120s 超时；失败重试 2 次；json_object 模式） ----------
export function createDeepseekCaller({ apiKey = process.env.DEEPSEEK_API_KEY, model = process.env.DEEPSEEK_MODEL || 'deepseek-chat', baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', backoffMs = 1000 } = {}) {
  if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY（服务端环境变量，浏览器永远见不到）')
  const fatal = msg => { const e = new Error(msg); e.noRetry = true; return e }
  return async function callAI(messages, tag) {
    let lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(120_000),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, max_tokens: tag === 'oneshot' ? 8192 : 4096, messages }),
        })
        if (!res.ok) {
          const body = (await res.text()).slice(0, 200)
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)
            throw fatal(`DeepSeek HTTP ${res.status}（确定性错误，不重试）: ${body}`)
          throw new Error(`DeepSeek HTTP ${res.status}: ${body}`)
        }
        const data = await res.json()
        if (data.choices?.[0]?.finish_reason === 'length') throw fatal('输出被 max_tokens 截断（段太长，重试无义）')
        return JSON.parse(data.choices?.[0]?.message?.content ?? '')
      } catch (e) {
        if (e.noRetry) { const w = new Error(`DeepSeek 调用失败（${tag}）: ${e.message}`); w.noRetry = true; throw w } // 标志透传（外层快败用）
        lastErr = e
        if (attempt < 2) await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)))
      }
    }
    throw new Error(`DeepSeek 调用失败（${tag}，已重试 2 次）: ${lastErr.message}`)
  }
}
