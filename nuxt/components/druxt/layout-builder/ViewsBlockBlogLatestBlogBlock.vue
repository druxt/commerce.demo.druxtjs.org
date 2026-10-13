<template>
  <section class="wrap py-12 flex flex-col gap-6">
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 class="text-3xl">Latest from our blog</h2>
      <NuxtLink to="/blog" class="text-sm text-accent hover:underline">Go to blog &rarr;</NuxtLink>
    </div>

    <div v-if="posts.length" class="grid gap-4 md:grid-cols-3">
      <NuxtLink
        v-for="post in posts"
        :key="post.id"
        :to="post.path"
        class="card overflow-hidden flex flex-col group hover:border-line-2 transition-colors duration-150"
      >
        <div class="aspect-4/3 bg-paper-3 overflow-hidden">
          <img v-if="post.image" :src="post.image" :alt="post.title" loading="lazy" class="w-full h-full object-cover">
          <div v-else class="w-full h-full flex items-center justify-center label-mono">no image</div>
        </div>
        <div class="p-4 flex flex-col gap-2 border-t border-line">
          <p class="label-mono">{{ post.date }}</p>
          <h3 class="text-15px font-600 leading-snug group-hover:underline">{{ post.title }}</h3>
          <p v-if="post.summary" class="text-13px text-ink-2">{{ post.summary }}</p>
        </div>
      </NuxtLink>
    </div>

    <p v-else-if="!$fetchState.pending" class="label-mono">No posts yet.</p>
  </section>
</template>

<script>
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'

export default {
  name: 'DruxtLayoutBuilderViewsBlockBlogLatestBlogBlock',

  props: {
    component: { type: Object, default: () => ({}) },
    entity: { type: Object, default: () => ({}) },
  },

  data: () => ({
    posts: [],
  }),

  // The block is a Views block. jsonapi_views cannot expose the Search API
  // backed catalogue view, but this one is node backed, so the collection
  // endpoint gives the same three posts with one request.
  async fetch() {
    const collection = await this.$store.dispatch('druxt/getCollection', {
      type: 'node--article',
      query: new DrupalJsonApiParams()
        .addFilter('status', '1')
        .addSort('created', 'DESC')
        .addPageLimit(3)
        .addInclude(['field_image']),
    })

    const included = collection.included || []
    const find = (ref) => (ref ? included.find((r) => r.id === ref.id && r.type === ref.type) : undefined)

    this.posts = (collection.data || []).map((n) => {
      const attrs = n.attributes || {}
      // field_image resolves straight to a file on this bundle, not to media.
      const file = find((((n.relationships || {}).field_image || {}).data))
      return {
        id: n.id,
        title: attrs.title,
        path: (attrs.path || {}).alias || `/node/${attrs.drupal_internal__nid}`,
        summary: (attrs.body || {}).summary || '',
        date: attrs.created
          ? new Date(attrs.created).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
          : '',
        image: (((file || {}).attributes || {}).uri || {}).url || '',
      }
    })
  },
}
</script>
