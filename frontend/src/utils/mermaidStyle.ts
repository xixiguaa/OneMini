/** 将 Mermaid 渲染结果调整为参考图风格 */
export function applyReferenceChartStyle(container: HTMLElement) {
  const svg = container.querySelector('svg')
  if (!svg) return

  svg.style.maxWidth = 'none'
  svg.style.height = 'auto'
  svg.style.background = 'transparent'

  container.querySelectorAll('.cluster rect').forEach((rect) => {
    const r = rect as SVGRectElement
    r.setAttribute('fill', '#FFFEF5')
    r.setAttribute('stroke', '#D9CC6B')
    r.setAttribute('stroke-width', '1')
    r.setAttribute('rx', '2')
    r.removeAttribute('filter')
  })

  container.querySelectorAll('.cluster-label').forEach((label) => {
    styleLabelEl(label as SVGElement, { fontWeight: '600', fontSize: '14px' })
  })

  container.querySelectorAll('.node').forEach((node) => {
    node.querySelectorAll('rect, polygon').forEach((shape) => {
      const s = shape as SVGElement
      s.setAttribute('fill', '#F0ECFA')
      s.setAttribute('stroke', '#B5A3D6')
      s.setAttribute('stroke-width', '1')
      s.removeAttribute('filter')
      if (s.tagName === 'rect') s.setAttribute('rx', '3')
    })
    node.querySelectorAll('.nodeLabel').forEach((label) => {
      styleLabelEl(label as SVGElement, { fontSize: '13px' })
    })
  })

  container.querySelectorAll('.edgePath .path, path.flowchart-link').forEach((path) => {
    const p = path as SVGElement
    p.setAttribute('stroke', '#222222')
    p.setAttribute('stroke-width', '1.2')
    p.setAttribute('fill', 'none')
  })

  container.querySelectorAll('marker path, defs marker polygon').forEach((el) => {
    const m = el as SVGElement
    m.setAttribute('fill', '#222222')
    m.setAttribute('stroke', '#222222')
  })

  container.querySelectorAll('.label foreignObject div, .edgeLabel foreignObject div').forEach(
    (div) => {
      const d = div as HTMLElement
      d.style.fontFamily = "'PingFang SC', 'Microsoft YaHei', sans-serif"
      d.style.color = '#1a1a1a'
      d.style.textAlign = 'center'
      d.style.lineHeight = '1.45'
    },
  )
}

function styleLabelEl(
  el: SVGElement,
  opts: { fontWeight?: string; fontSize?: string },
) {
  const fo = el.querySelector('foreignObject')
  const div = fo?.querySelector('div') as HTMLElement | null
  if (!div) return
  div.style.fontFamily = "'PingFang SC', 'Microsoft YaHei', sans-serif"
  div.style.color = '#1a1a1a'
  div.style.textAlign = 'center'
  div.style.lineHeight = '1.45'
  if (opts.fontWeight) div.style.fontWeight = opts.fontWeight
  if (opts.fontSize) div.style.fontSize = opts.fontSize
}
