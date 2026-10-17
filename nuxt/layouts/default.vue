<template>
  <!--
    Mirrors druxt-site's own layout. The app needs its own copy: once this
    directory exists, Nuxt stops falling back to the module's layout and would
    otherwise render the router directly, with no DruxtSite wrapper and so no
    site chrome at all.

    The chrome itself lives in components/druxt/site/Belgrade.vue, which
    DruxtSite resolves from the configured theme.
  -->
  <DruxtSite />
</template>

<script>
import { seoHead } from '~/utils/seo'

export default {
  name: 'DefaultLayout',

  // The head a page gets when it says nothing of its own: the canonical link,
  // the share card and the site's structured data.
  head() {
    return seoHead({ origin: this.$config.siteOrigin, path: this.$route.path })
  },
}
</script>
