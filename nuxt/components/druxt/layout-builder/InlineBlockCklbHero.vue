<template>
  <div v-if="!$fetchState.pending">
    <img :src="file.attributes.uri.url" />
    <DruxtDebug :json="{ component, entity }" />
  </div>
</template>

<script>
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'

export default {
  props: {
    component: {
      type: Object,
      require: true,
    },
    entity: {
      type: Object,
      require: true,
    }
  },

  data: () => ({
    file: undefined,
    media: undefined,
  }),

  async fetch() {
    if (this.hasBackgroundImage) {
      const { data, included } = await this.$store.dispatch('druxt/getCollection', {
        type: 'media--image',
        query: new DrupalJsonApiParams()
          .addFilter('drupal_internal__mid', this.backgroundImageId)
          .addInclude('field_media_image')
      })
      this.media = data[0]
      this.file = included.find((o) => o.id === this.media.relationships.field_media_image.data.id)
    }
  },

  computed: {
    // Background image:
    backgroundImageId: ({ component }) => component.additional.bootstrap_styles.block_style.background_media.image.media_id,
    hasBackgroundImage: ({ backgroundImageId }) => !!backgroundImageId,
  }
}
</script>
