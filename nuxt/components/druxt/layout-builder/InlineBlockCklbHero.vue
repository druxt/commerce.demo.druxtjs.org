<template>
  <!-- Fills the carousel's cell, so every slide is the same height whatever
       its copy, and the control bar sits on the image, not under it. -->
  <section class="relative h-full bg-ink text-paper overflow-hidden">
    <img
      v-if="backgroundUrl"
      :src="backgroundUrl"
      alt=""
      aria-hidden="true"
      class="absolute inset-0 w-full h-full object-cover opacity-45"
    >

    <div class="relative wrap pt-20 pb-28 sm:py-28 flex flex-col gap-6 items-start">
      <p v-if="subtitle" class="label-mono text-mint">{{ subtitle }}</p>

      <h1 v-if="title" class="text-4xl sm:text-6xl max-w-3xl">{{ title }}</h1>

      <div v-if="text" class="prose text-paper/80 max-w-2xl" v-html="text" />

      <NuxtLink v-if="ctaPath" :to="ctaPath" class="btn bg-paper text-ink border-paper hover:bg-paper-2 hover:border-paper-2">
        {{ ctaTitle }}
      </NuxtLink>
    </div>
  </section>
</template>

<script>
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'
import inlineBlock from '~/mixins/inlineBlock'

export default {
  name: 'DruxtLayoutBuilderInlineBlockCklbHero',

  mixins: [inlineBlock],

  data: () => ({
    background: undefined,
  }),

  // The hero's background is not on the block. Bootstrap Layout Builder stores
  // it on the component as a media id, so it is a second lookup: media, then
  // the file it references.
  async fetch() {
    await inlineBlock.fetch.call(this)

    const style = this.blockStyle || {}
    const mediaId = (((style.background_media || {}).image || {}).media_id)
    if ((style.background || {}).background_type !== 'image' || !mediaId) return

    const collection = await this.$store.dispatch('druxt/getCollection', {
      type: 'media--image',
      query: new DrupalJsonApiParams()
        .addFilter('drupal_internal__mid', mediaId)
        .addInclude(['field_media_image']),
    })

    const file = (collection.included || []).find((r) => r.type === 'file--file')
    this.background = (((file || {}).attributes || {}).uri || {}).url
  },

  computed: {
    title: ({ attrs }) => attrs.cklb_title,

    subtitle: ({ attrs }) => attrs.cklb_subtitle,

    text: ({ attrs }) => (attrs.cklb_text || {}).processed || '',

    cta: ({ attrs }) => attrs.cklb_cta || {},

    ctaPath() {
      return this.linkPath(this.cta)
    },

    ctaTitle: ({ cta }) => cta.title || 'Shop the catalogue',

    backgroundUrl: ({ background }) => background,
  },
}
</script>
