<template>
  <figure v-if="url" class="m-0 card overflow-hidden aspect-4/3 bg-paper-3">
    <img :src="url" :alt="alt" loading="lazy" class="w-full h-full object-cover">
  </figure>
</template>

<script>
import inlineBlock from '~/mixins/inlineBlock'

export default {
  name: 'DruxtLayoutBuilderInlineBlockCklbImage',

  mixins: [inlineBlock],

  data: () => ({ blockIncludes: ['cklb_image.field_media_image'] }),

  computed: {
    // Follow this block's own reference: cklb_image -> media -> file.
    //
    // The first version took the first file--file in `included`, which is
    // wrong the moment more than one block of a bundle is fetched. The mixin
    // fetches the whole bundle, so `included` holds every block's media, and
    // every image on the page rendered whichever file happened to be first.
    // Five image blocks, one repeated picture.
    media() {
      const ref = (((this.block || {}).relationships || {}).cklb_image || {}).data
      if (!ref) return undefined
      return (this.included || []).find((r) => r.type === ref.type && r.id === ref.id)
    },

    file() {
      const ref = (((this.media || {}).relationships || {}).field_media_image || {}).data
      if (!ref) return undefined
      return (this.included || []).find((r) => r.type === ref.type && r.id === ref.id)
    },

    url: ({ file }) => (((file || {}).attributes || {}).uri || {}).url,

    // Drupal stores the alt text on the reference, not on the file.
    alt() {
      const ref = (((this.media || {}).relationships || {}).field_media_image || {}).data || {}
      return ((ref.meta || {}).alt) || ''
    },
  },
}
</script>
