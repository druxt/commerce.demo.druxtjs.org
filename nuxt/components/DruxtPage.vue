<script>
import DruxtRouter from 'druxt-router/dist/components/DruxtRouter.vue'
import { canonicalPath } from '~/lib/site'
import { seoHead } from '~/utils/seo'

/**
 * Every Drupal path, rendered by Druxt's router page with the storefront's
 * head. The router's own head names Drupal's canonical URL, on Drupal's
 * host; this one names the storefront's, and the product and article
 * components refine it with their own data.
 *
 * modules/seo-files.js puts this component on the router's route.
 */
export default {
  extends: DruxtRouter,

  head() {
    const path = this.$route.path
    const label = (this.route || {}).label
    return seoHead({
      origin: this.$config.siteOrigin,
      path,
      // The front page's label is its Layout Builder title, and the home takes the site's own.
      title: canonicalPath(path) === '/' ? undefined : label || undefined,
    })
  },
}
</script>
