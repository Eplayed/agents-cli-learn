/**
 * Markdown 渲染（marked）+ <think> 推理块处理
 *
 * Qwen3 等模型会输出 <think>...</think> 推理过程，
 * 这里把它渲染成可折叠、淡化的样式块，不干扰正式回答。
 */
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

export function renderMarkdown(text: string): string {
  if (!text) return ''

  // 提取 <think>...</think>（含未闭合的流式情况）
  const thinkBlocks: string[] = []
  let cleaned = text.replace(/<think>([\s\S]*?)<\/think>/g, (_m, c) => {
    const idx = thinkBlocks.length
    thinkBlocks.push(String(c).trim())
    return `\n\n<!--THINK_${idx}-->\n\n`
  })
  cleaned = cleaned.replace(/<think>([\s\S]*)$/g, (_m, c) => {
    const idx = thinkBlocks.length
    thinkBlocks.push(String(c).trim())
    return `\n\n<!--THINK_${idx}-->\n\n`
  })

  let html = marked.parse(cleaned, { async: false }) as string

  for (let i = 0; i < thinkBlocks.length; i++) {
    const inner = thinkBlocks[i] ? (marked.parse(thinkBlocks[i], { async: false }) as string) : ''
    const block = `<details class="think-block"><summary class="think-toggle">💭 思考过程（点击展开）</summary>${inner}</details>`
    html = html.replace(new RegExp(`(<p>)?\\s*&lt;!--THINK_${i}--&gt;\\s*(</p>)?`, 'g'), block)
    html = html.replace(new RegExp(`(<p>)?\\s*<!--THINK_${i}-->\\s*(</p>)?`, 'g'), block)
  }

  return html
}
