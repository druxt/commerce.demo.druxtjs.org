<template>
  <div>
    <DruxtLayoutBuilder :entity="entity" />
    <client-only>
      <div class="wrap">
        <DruxtDemoNote
          match="/jsonapi/node/cklb_landing_page"
          file="nuxt/components/druxt/entity/node/CklbLandingPage.vue"
          body="This page is Drupal's Layout Builder page, rendered section by section by the layout-builder module."
        />
      </div>
    </client-only>
    <HomePitches v-if="$route.path === '/'" />
  </div>
</template>

<script>
import { DruxtEntityMixin } from 'druxt-entity'
export default {
  mixins: [DruxtEntityMixin]
}
</script>
