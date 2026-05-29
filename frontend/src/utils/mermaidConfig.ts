import mermaid from 'mermaid'

let initialized = false

/** 深空极光主题：浅紫节点 + 紫蓝边框 */
export function ensureMermaidInit() {
  if (initialized) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
      fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif",
      fontSize: '13px',
      primaryColor: '#F0EDFF',
      primaryBorderColor: '#7B5FFF',
      primaryTextColor: '#1A1A35',
      secondaryColor: '#F0EDFF',
      secondaryBorderColor: '#7B5FFF',
      tertiaryColor: '#F0EDFF',
      tertiaryBorderColor: '#7B5FFF',
      lineColor: '#4A3AE8',
      arrowheadColor: '#4A3AE8',
      clusterBkg: '#EDEEF8',
      clusterBorder: '#826AFB',
      titleColor: '#1A1A35',
      edgeLabelBackground: '#ffffff',
      nodeBorder: '#7B5FFF',
      mainBkg: '#F0EDFF',
      textColor: '#1A1A35',
      border1: '#826AFB',
      border2: '#7B5FFF',
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
