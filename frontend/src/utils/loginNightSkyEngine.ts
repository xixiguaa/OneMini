import * as THREE from 'three'

const STAR_DENSITY = 1 / 1300

const PARALLAX = {
  far: 0.018,
  mid: 0.048,
  near: 0.11,
  milky: 0.028,
} as const

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aTwSpeed;
  attribute float aBaseAlpha;
  attribute float aBright;

  uniform float uTime;

  varying float vAlpha;
  varying float vBright;

  void main() {
    float twinkle = 0.35 + 0.65 * sin(uTime * aTwSpeed + aPhase);
    float twinkle2 = 0.18 * sin(uTime * aTwSpeed * 2.4 + aPhase * 1.6);
    vAlpha = aBaseAlpha * clamp(twinkle + twinkle2, 0.0, 1.0);
    vBright = aBright;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.5, aSize * 3.8);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const STAR_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying float vBright;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);

    float core = 1.0 - smoothstep(0.0, 0.24, dist);
    float glow = 1.0 - smoothstep(0.0, 0.52, dist);
    float alpha = vAlpha * (core * 0.95 + glow * 0.55);

    if (vBright > 0.5) {
      float cross = exp(-abs(uv.x) * 9.0) + exp(-abs(uv.y) * 9.0);
      alpha += cross * vAlpha * 0.38;
    }

    if (alpha < 0.01) discard;

    vec3 color = mix(vec3(0.847, 0.816, 1.0), vec3(0.98, 0.973, 1.0), vBright);
    gl_FragColor = vec4(color, alpha);
  }
`

interface StarLayerConfig {
  key: keyof typeof PARALLAX
  ratio: number
  sizeMin: number
  sizeMax: number
  brightThreshold: number
}

const LAYER_CONFIGS: StarLayerConfig[] = [
  { key: 'far', ratio: 0.52, sizeMin: 1.0, sizeMax: 2.4, brightThreshold: 1.1 },
  { key: 'mid', ratio: 0.33, sizeMin: 1.8, sizeMax: 3.8, brightThreshold: 0.9 },
  { key: 'near', ratio: 0.15, sizeMin: 3.2, sizeMax: 6.5, brightThreshold: 0.75 },
]

interface StarLayer {
  group: THREE.Group
  material: THREE.ShaderMaterial
  parallax: number
}

interface MeteorState {
  line: THREE.Line
  head: THREE.Vector3
  direction: THREE.Vector3
  travel: number
  progress: number
  maxTail: number
}

export interface NightSkyEngine {
  setPointer: (nx: number, ny: number) => void
  resize: () => void
  dispose: () => void
}

export function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function buildStarLayer(w: number, h: number, count: number, cfg: StarLayerConfig): StarLayer {
  const positions: number[] = []
  const sizes: number[] = []
  const phases: number[] = []
  const twSpeeds: number[] = []
  const baseAlphas: number[] = []
  const brights: number[] = []

  for (let i = 0; i < count; i++) {
    const seed = i + cfg.key.length * 997
    positions.push(
      seededRandom(seed + 11) * w - w / 2,
      seededRandom(seed + 23) * h - h / 2,
      seededRandom(seed + 31) * 0.4 - 0.2,
    )
    const bright = seededRandom(seed + 1) > cfg.brightThreshold ? 1 : 0
    sizes.push(cfg.sizeMin + seededRandom(seed + 37) * (cfg.sizeMax - cfg.sizeMin))
    phases.push(seededRandom(seed + 101) * Math.PI * 2)
    twSpeeds.push(0.55 + seededRandom(seed + 89) * 2.2)
    baseAlphas.push(0.38 + seededRandom(seed + 71) * (bright ? 0.52 : 0.38))
    brights.push(bright)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
  geometry.setAttribute('aTwSpeed', new THREE.Float32BufferAttribute(twSpeeds, 1))
  geometry.setAttribute('aBaseAlpha', new THREE.Float32BufferAttribute(baseAlphas, 1))
  geometry.setAttribute('aBright', new THREE.Float32BufferAttribute(brights, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  const group = new THREE.Group()
  group.add(points)

  return { group, material, parallax: PARALLAX[cfg.key] }
}

function buildMilkyWayLayer(w: number, h: number): StarLayer {
  const count = Math.max(90, Math.floor(w * 0.32))
  const positions: number[] = []
  const sizes: number[] = []
  const phases: number[] = []
  const twSpeeds: number[] = []
  const baseAlphas: number[] = []
  const brights: number[] = []

  const bandY = h * 0.08
  const bandSpread = h * 0.14

  for (let i = 0; i < count; i++) {
    const seed = i + 5000
    const x = seededRandom(seed + 11) * w * 1.15 - w * 0.575
    const yRaw = (seededRandom(seed + 23) + seededRandom(seed + 29) - 1) * bandSpread + bandY
    positions.push(x, yRaw, -0.35)
    sizes.push(1.2 + seededRandom(seed + 37) * 2.2)
    phases.push(seededRandom(seed + 101) * Math.PI * 2)
    twSpeeds.push(0.2 + seededRandom(seed + 89) * 0.6)
    baseAlphas.push(0.1 + seededRandom(seed + 71) * 0.16)
    brights.push(seededRandom(seed + 1) > 0.92 ? 0.6 : 0)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
  geometry.setAttribute('aTwSpeed', new THREE.Float32BufferAttribute(twSpeeds, 1))
  geometry.setAttribute('aBaseAlpha', new THREE.Float32BufferAttribute(baseAlphas, 1))
  geometry.setAttribute('aBright', new THREE.Float32BufferAttribute(brights, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  const group = new THREE.Group()
  group.add(points)

  return { group, material, parallax: PARALLAX.milky }
}

export function createNightSkyEngine(container: HTMLElement): NightSkyEngine | null {
  if (!supportsWebGL()) return null

  let width = container.clientWidth
  let height = container.clientHeight
  if (width <= 0 || height <= 0) return null

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 50)
  camera.position.z = 10

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.style.pointerEvents = 'none'
  container.appendChild(renderer.domElement)

  const layers: StarLayer[] = []

  function rebuildLayers() {
    for (const layer of layers) {
      scene.remove(layer.group)
      layer.group.traverse((obj) => {
        if (obj instanceof THREE.Points) obj.geometry.dispose()
      })
      layer.material.dispose()
    }
    layers.length = 0

    const total = Math.max(60, Math.floor(width * height * STAR_DENSITY))
    for (const cfg of LAYER_CONFIGS) {
      layers.push(buildStarLayer(width, height, Math.max(8, Math.floor(total * cfg.ratio)), cfg))
      scene.add(layers[layers.length - 1].group)
    }
    layers.push(buildMilkyWayLayer(width, height))
    scene.add(layers[layers.length - 1].group)
  }

  rebuildLayers()

  const meteors: MeteorState[] = []
  let meteorTimer = 0
  let rafId = 0
  let pointerNx = 0
  let pointerNy = 0
  let smoothNx = 0
  let smoothNy = 0

  function spawnMeteor() {
    const angle = Math.PI / 6 + Math.random() * (Math.PI / 5)
    const travel = width * 0.45 + Math.random() * width * 0.25
    const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize()
    const start = new THREE.Vector3(
      Math.random() * width * 0.75 - width * 0.375,
      height * 0.15 + Math.random() * height * 0.25 - height / 2,
      0.2,
    )

    const positions = new Float32Array(6)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.LineBasicMaterial({
      color: 0xd4e4ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const line = new THREE.Line(geometry, material)
    scene.add(line)

    meteors.push({
      line,
      head: start.clone(),
      direction,
      travel,
      progress: 0,
      maxTail: 70 + Math.random() * 80,
    })
  }

  function scheduleMeteor() {
    meteorTimer = window.setTimeout(() => {
      spawnMeteor()
      scheduleMeteor()
    }, 4000 + Math.random() * 6000)
  }

  function updateMeteors() {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]
      m.progress = Math.min(1, m.progress + 0.016)
      const eased = easeOutCubic(m.progress)
      const head = m.head.clone().addScaledVector(m.direction, m.travel * eased)
      const tailLen = m.maxTail * (1 - m.progress * 0.92)
      const tail = head.clone().addScaledVector(m.direction, -tailLen)

      const attr = m.line.geometry.getAttribute('position') as THREE.BufferAttribute
      attr.setXYZ(0, tail.x, tail.y, tail.z)
      attr.setXYZ(1, head.x, head.y, head.z)
      attr.needsUpdate = true

      const mat = m.line.material as THREE.LineBasicMaterial
      mat.opacity = 0.85 * (1 - m.progress * 0.85)

      if (m.progress >= 1) {
        scene.remove(m.line)
        m.line.geometry.dispose()
        mat.dispose()
        meteors.splice(i, 1)
      }
    }
  }

  function tick(time: number) {
    const t = time * 0.001
    smoothNx += (pointerNx - smoothNx) * 0.06
    smoothNy += (pointerNy - smoothNy) * 0.06

    for (const layer of layers) {
      layer.material.uniforms.uTime.value = t
      layer.group.position.x = smoothNx * width * layer.parallax
      layer.group.position.y = -smoothNy * height * layer.parallax
    }

    updateMeteors()
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
  scheduleMeteor()

  return {
    setPointer(nx: number, ny: number) {
      pointerNx = nx
      pointerNy = ny
    },
    resize() {
      width = container.clientWidth
      height = container.clientHeight
      if (width <= 0 || height <= 0) return

      camera.left = -width / 2
      camera.right = width / 2
      camera.top = height / 2
      camera.bottom = -height / 2
      camera.updateProjectionMatrix()

      renderer.setSize(width, height)
      rebuildLayers()
    },
    dispose() {
      cancelAnimationFrame(rafId)
      clearTimeout(meteorTimer)

      for (const m of meteors) {
        scene.remove(m.line)
        m.line.geometry.dispose()
        ;(m.line.material as THREE.Material).dispose()
      }
      meteors.length = 0

      for (const layer of layers) {
        scene.remove(layer.group)
        layer.group.traverse((obj) => {
          if (obj instanceof THREE.Points) obj.geometry.dispose()
        })
        layer.material.dispose()
      }

      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
