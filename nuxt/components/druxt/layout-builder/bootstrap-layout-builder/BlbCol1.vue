<template>
  <section :class="sectionClass">
    <div :class="containerClass">
      <div :class="rowClass">
        <div v-for="region in regions" :key="region" :class="regionClass(region)">
          <slot v-for="name in slotsByRegion[region]" :name="name" />
        </div>
      </div>
    </div>
  </section>
</template>

<script>
import blbSection from '~/mixins/blbSection'

export default {
  // Bootstrap Layout Builder's 1-column layout. The grid comes from the
  // section's own settings, so this file carries no column widths of its own.
  name: 'DruxtLayoutBuilderBootstrapLayoutBuilderBlbCol1',
  mixins: [blbSection],
}
</script>
