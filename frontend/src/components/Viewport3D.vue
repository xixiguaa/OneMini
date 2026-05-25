<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useAgentStore } from '../stores/agent'

const agent = useAgentStore()
const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let animationId: number
let previewMesh: THREE.Mesh | null = null

function initScene() {
  if (!containerRef.value) return

  const { clientWidth: w, clientHeight: h } = containerRef.value

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a22)
  scene.fog = new THREE.Fog(0x1a1a22, 8, 30)

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100)
  camera.position.set(4, 3, 5)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.maxPolarAngle = Math.PI / 2.1

  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
  dirLight.position.set(5, 10, 5)
  dirLight.castShadow = true
  scene.add(dirLight)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.9 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(20, 20, 0x444455, 0x333344)
  scene.add(grid)

  addPlaceholderScene()

  const animate = () => {
    animationId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
}

function addPlaceholderScene() {
  const group = new THREE.Group()

  const boxMat = new THREE.MeshStandardMaterial({ color: 0x6b5b4f, roughness: 0.8 })
  const wall1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 4), boxMat)
  wall1.position.set(-2, 1, 0)
  wall1.castShadow = true
  group.add(wall1)

  const wall2 = wall1.clone()
  wall2.position.set(2, 1, 0)
  group.add(wall2)

  const barrelGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.8, 12)
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.7 })
  for (let i = 0; i < 3; i++) {
    const barrel = new THREE.Mesh(barrelGeo, barrelMat)
    barrel.position.set(-0.8 + i * 0.9, 0.4, 1.2)
    barrel.castShadow = true
    group.add(barrel)
  }

  const stepMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.85 })
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.5), stepMat)
    step.position.set(0, 0.08 + i * 0.15, -1.5 - i * 0.4)
    step.castShadow = true
    group.add(step)
  }

  scene.add(group)
}

function showPreviewImage(url: string) {
  if (previewMesh) {
    scene.remove(previewMesh)
    previewMesh.geometry.dispose()
    ;(previewMesh.material as THREE.Material).dispose()
    previewMesh = null
  }

  const loader = new THREE.TextureLoader()
  loader.crossOrigin = 'anonymous'
  loader.load(
    url,
    (texture) => {
      const aspect = texture.image.width / texture.image.height
      const geo = new THREE.PlaneGeometry(4 * aspect, 4)
      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      previewMesh = new THREE.Mesh(geo, mat)
      previewMesh.position.set(0, 2.5, 0)
      scene.add(previewMesh)
    },
    undefined,
    () => console.warn('预览图加载失败'),
  )
}

function handleResize() {
  if (!containerRef.value) return
  const { clientWidth: w, clientHeight: h } = containerRef.value
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

watch(
  () => agent.worldPreviewUrl,
  (url) => {
    if (url) showPreviewImage(url)
  },
)

onMounted(() => {
  initScene()
  window.addEventListener('resize', handleResize)
  if (agent.worldPreviewUrl) showPreviewImage(agent.worldPreviewUrl)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', handleResize)
  renderer?.dispose()
})
</script>

<template>
  <div ref="containerRef" class="viewport" />
</template>

<style scoped lang="scss">
.viewport {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;

  :deep(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    pointer-events: auto;
  }
}
</style>
