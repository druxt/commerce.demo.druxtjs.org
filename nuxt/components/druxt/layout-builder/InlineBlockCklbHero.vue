<template>
  <div v-if="!$fetchState.pending" :style="containerStyles">
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
    block: undefined,
    file: undefined,
    media: undefined,
  }),

  async fetch() {
    // @TODO - Fetch the block (block_content--cklb_hero)

    if (this.hasBackgroundImage) {
      const backgroundImage = await this.$store.dispatch('druxt/getCollection', {
        type: 'media--image',
        query: new DrupalJsonApiParams()
          .addFilter('drupal_internal__mid', this.backgroundImageId)
          .addInclude('field_media_image')
      })
      this.media = backgroundImage.data[0]
      this.file = backgroundImage.included.find((o) => o.id === this.media.relationships.field_media_image.data.id)
    }
  },

  computed: {
    blockStyle: ({ component }) => component.additional.bootstrap_styles.block_style,

    // Background image:
    backgroundImageId: ({ blockStyle }) => blockStyle.background_media.image.media_id,
    hasBackgroundImage: ({ blockStyle, backgroundImageId }) => blockStyle.background.background_type === 'image' && !!backgroundImageId,

    containerStyles: ({ blockStyle, hasBackgroundImage, file }) => {
      const styles = {}
      if (hasBackgroundImage && file) {
        const options = blockStyle.background_media.background_options
        styles.backgroundImage = `url(${file.attributes.uri.url})`
        styles.backgroundPosition = options.background_position
        styles.backgroundRepeat = options.background_repeat
        styles.backgroundSize = options.background_size
        if (options.background_attachement === "fixed") styles.backgroundAttachment = 'fixed'
      }

      return styles
    }
  }
}
</script>
