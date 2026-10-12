import path from 'path'

/**
 * What search engines and share cards read. The router's route renders
 * components/DruxtPage.vue, which gives every Drupal path the storefront's
 * head.
 */
export default function () {
  // Registered after druxt-site, whose router module adds the route.
  this.extendRoutes((routes) => {
    for (const route of routes) {
      if (String(route.name || '').startsWith('druxt-router')) {
        route.component = path.resolve(this.options.srcDir, 'components/DruxtPage.vue')
      }
    }
  })
}
