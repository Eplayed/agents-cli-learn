import { createRouter, createWebHistory } from 'vue-router'

// base = /ui，因为应用由 FastAPI 挂载在 /ui 路径下
export const router = createRouter({
  history: createWebHistory('/ui'),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: () => import('../views/ChatView.vue'),
    },
    {
      path: '/skills',
      name: 'skills',
      component: () => import('../views/SkillsView.vue'),
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/LogView.vue'),
    },
  ],
})
