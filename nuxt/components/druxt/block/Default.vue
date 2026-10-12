<template>
  <!--
    The storefront owns its chrome, so Drupal's theme blocks are not rendered.
    Kickstart's Belgrade regions carry admin affordances (local tasks, local
    actions, help, messages) and a branding and cart block this storefront
    already provides itself.

    Druxt's default is a visible "Missing Vue template" panel naming the
    components you could write. That is the right default for development and
    the wrong one here, because none of these blocks is missing: each is
    deliberately not rendered.

    In development the block is still announced in the console, so a block that
    genuinely should have a component does not disappear silently.
  -->
  <div />
</template>

<script>
export default {
  name: 'DruxtBlockDefault',

  props: {
    block: { type: Object, default: () => ({}) },
  },

  mounted() {
    if (process.env.NODE_ENV === 'production') return
    const id = ((this.block || {}).attributes || {}).drupal_internal__id
    if (id) {
      // eslint-disable-next-line no-console
      console.info(`[storefront] Drupal block "${id}" is not rendered: the storefront provides its own chrome.`)
    }
  },
}
</script>
