import type { NavigationMenuItem } from '@nuxt/ui'

export const navLinks: NavigationMenuItem[] = [{
  label: '首頁',
  icon: 'i-lucide-home',
  to: '/'
}, {
  label: '專案',
  icon: 'i-lucide-folder',
  to: '/projects'
}, {
  label: '文章',
  icon: 'i-lucide-file-text',
  to: '/blog'
}, {
  label: '關於',
  icon: 'i-lucide-user',
  to: '/about'
}]
