<template>
  <!-- The page alone: the store's type and ground, none of its chrome. -->
  <main class="min-h-screen bg-paper-2 text-ink">
    <Nuxt />
  </main>
</template>

<script>
import { NOINDEX } from '~/utils/seo'

export default {
  name: 'PreviewLayout',

  // An unsaved node, never a page to index.
  head: () => ({ meta: [NOINDEX] }),
}
</script>
