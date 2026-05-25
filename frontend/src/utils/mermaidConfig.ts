import mermaid from 'mermaid'

let initialized = false

/** 参考图：横向 subgraph 黄框 + 节点浅紫、细线箭头 */
export function ensureMermaidInit() {
  if (initialized) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
      fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif",
      fontSize: '13px',
      primaryColor: '#F0ECFA',
      primaryBorderColor: '#B5A3D6',
      primaryTextColor: '#1a1a1a',
      secondaryColor: '#F0ECFA',
      secondaryBorderColor: '#B5A3D6',
      tertiaryColor: '#F0ECFA',
      tertiaryBorderColor: '#B5A3D6',
      lineColor: '#222222',
      arrowheadColor: '#222222',
      clusterBkg: '#FFFEF5',
      clusterBorder: '#D9CC6B',
      titleColor: '#1a1a1a',
      edgeLabelBackground: '#ffffff',
      nodeBorder: '#B5A3D6',
      mainBkg: '#F0ECFA',
      textColor: '#1a1a1a',
      border1: '#D9CC6B',
      border2: '#B5A3D6',
    },
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: 'linear',
      padding: 24,
      nodeSpacing: 36,
      rankSpacing: 56,
      diagramPadding: 16,
      wrappingWidth: 200,
    },
  })
  initialized = true
}
