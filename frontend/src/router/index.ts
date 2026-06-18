import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/chat'
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('../views/chat/ChatView.vue')
  },
  {
    path: '/create',
    name: 'create',
    component: () => import('../views/create/CreateStudio.vue')
  },
  {
    path: '/world',
    name: 'world',
    component: () => import('../views/world/WorldStudio.vue')
  },
  {
    path: '/models',
    name: 'models',
    component: () => import('../views/models/ModelsView.vue')
  },
  {
    path: '/skills',
    name: 'skills',
    component: () => import('../views/skills/SkillsView.vue')
  },
  {
    path: '/knowledge',
    name: 'knowledge',
    component: () => import('../views/knowledge/KnowledgeView.vue')
  },
  {
    path: '/wikiGraph',
    name: 'wikiGraph',
    component: () => import('../views/wikiGraph/WikiGraphView.vue')
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/profile/UserProfileView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
