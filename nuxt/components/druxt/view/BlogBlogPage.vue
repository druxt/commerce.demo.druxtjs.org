<template>
  <div class="wrap pt-[clamp(28px,4vw,48px)] pb-[clamp(48px,7vw,88px)] flex flex-col gap-[clamp(24px,3vw,36px)]">
    <header class="flex flex-wrap items-baseline gap-3">
      <h1 class="text-[clamp(30px,5vw,44px)] tracking-tight">Blog</h1>
      <p class="font-mono text-13px text-ink-2">{{ posts.length }} posts</p>
    </header>

    <!-- The newest post leads, the rest follow in the View's order. -->
    <NuxtLink
      v-if="lead"
      :to="lead.path"
      class="card overflow-hidden grid md:grid-cols-[7fr_5fr] group hover:border-line-2 transition-colors duration-150"
    >
      <div class="aspect-[16/10] md:aspect-auto md:min-h-90 bg-paper-3 overflow-hidden">
        <img v-if="lead.image" :src="lead.image" alt="" class="w-full h-full object-cover">
      </div>
      <div class="p-[clamp(20px,3vw,40px)] flex flex-col justify-center gap-3">
        <p class="label-mono">{{ lead.date }}<template v-if="lead.tag"> · {{ lead.tag }}</template></p>
        <h2 class="text-[clamp(24px,3vw,34px)] leading-tight tracking-tight group-hover:underline">{{ lead.title }}</h2>
        <p v-if="lead.summary" class="text-15px text-ink-2 leading-relaxed">{{ lead.summary }}</p>
        <span class="text-14px font-600 text-accent">Read the post &rarr;</span>
      </div>
    </NuxtLink>

    <div v-if="rest.length" class="grid gap-[clamp(12px,1.6vw,20px)] sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="post in rest"
        :key="post.id"
        :to="post.path"
        class="card overflow-hidden flex flex-col group hover:border-line-2 transition-colors duration-150"
      >
        <div class="aspect-4/3 bg-paper-3 overflow-hidden">
          <img v-if="post.image" :src="post.image" alt="" loading="lazy" class="w-full h-full object-cover">
        </div>
        <div class="p-5 flex flex-col gap-2 border-t border-line">
          <p class="label-mono">{{ post.date }}<template v-if="post.tag"> · {{ post.tag }}</template></p>
          <h2 class="text-17px font-600 leading-snug group-hover:underline">{{ post.title }}</h2>
          <p v-if="post.summary" class="text-13px text-ink-2 leading-relaxed">{{ post.summary }}</p>
        </div>
      </NuxtLink>
    </div>

    <p v-if="!posts.length && !$fetchState.pending" class="label-mono">No posts yet.</p>

    <client-only>
      <DruxtDemoNote
        match="/jsonapi/views/blog/blog_page"
        file="nuxt/components/druxt/view/BlogBlogPage.vue"
        body="Kickstart's blog View, read through JSON:API Views. The View decides which posts and in what order; the cards come from one request for their images and tags."
      />
    </client-only>
  </div>
</template>

<script>
import { DruxtViewsViewMixin } from 'druxt-views'
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'
import { postDate } from '~/lib/dates'

export default {
  name: 'DruxtViewBlogBlogPage',

  mixins: [DruxtViewsViewMixin],

  data: () => ({ cards: [] }),

  head: () => ({ title: 'Blog' }),

  async fetch() {
    const ids = (this.results || []).map((r) => r.id).filter(Boolean)
    if (!ids.length) return
    const doc = await this.$store.dispatch('druxt/getCollection', {
      type: 'node--article',
      query: new DrupalJsonApiParams().addFilter('id', ids, 'IN').addInclude(['field_image', 'field_tags']),
    })
    const find = (ref) => (ref ? (doc.included || []).find((r) => r.id === ref.id && r.type === ref.type) : undefined)
    this.cards = (doc.data || []).map((n) => {
      const attrs = n.attributes || {}
      const rels = n.relationships || {}
      const file = find((rels.field_image || {}).data)
      const tag = find(((rels.field_tags || {}).data || [])[0])
      return {
        id: n.id,
        title: attrs.title,
        path: (attrs.path || {}).alias || `/node/${attrs.drupal_internal__nid}`,
        summary: (attrs.body || {}).summary || '',
        date: postDate(attrs.created),
        image: (((file || {}).attributes || {}).uri || {}).url || '',
        tag: ((tag || {}).attributes || {}).name || '',
      }
    })
  },

  computed: {
    posts: ({ results, cards }) => (results || []).map((r) => cards.find((c) => c.id === r.id)).filter(Boolean),
    lead: ({ posts }) => posts[0] || null,
    rest: ({ posts }) => posts.slice(1),
  },

  watch: {
    results() {
      this.$fetch()
    },
  },
}
</script>
