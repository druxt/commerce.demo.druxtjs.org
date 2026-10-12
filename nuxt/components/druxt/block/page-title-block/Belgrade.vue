<template>
  <!--
    Belgrade places a page-title block in the content region, above the node.
    Every storefront page provides its own heading in its own design: the
    landing page opens with the hero, the product page with the product name.
    Rendering Drupal's title as well put a bare <h1> above the hero that
    duplicated what the page already said.

    The document title still comes from the entity, so nothing is lost to
    search engines or the browser tab.

    Named for the theme rather than the plugin alone: druxt-blocks ships its
    own DruxtBlockPageTitleBlock, and Druxt tries plugin+theme before the
    plugin on its own, so a plainer name never gets a look in.
  -->
  <div />
</template>

<script>
export default {
  name: 'DruxtBlockPageTitleBlockBelgrade',
}
</script>
