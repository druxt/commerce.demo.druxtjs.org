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
export default {
  name: 'DefaultLayout',
}
</script>
