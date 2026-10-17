<template>
  <article class="pb-[clamp(48px,7vw,88px)]">
    <header class="wrap"><div class="mx-auto max-w-[760px] pt-[clamp(28px,4vw,48px)] flex flex-col gap-4">
      <nav aria-label="Breadcrumb" class="font-mono text-11px tracking-wide text-ink-2">
        <NuxtLink to="/" class="text-ink-2 hover:text-ink">Home</NuxtLink>
        <span class="mx-1.5 text-ink-3" aria-hidden="true">/</span>
        <NuxtLink to="/blog" class="text-ink-2 hover:text-ink">Blog</NuxtLink>
        <template v-if="tags.length">
          <span class="mx-1.5 text-ink-3" aria-hidden="true">/</span>
          <span>{{ tags[0] }}</span>
        </template>
      </nav>
      <h1 class="text-[clamp(30px,5vw,48px)] leading-[1.08] tracking-tight">{{ title }}</h1>
      <p class="label-mono">
        <time :datetime="attrs.created">{{ date }}</time>
        <template v-if="minutes"> · {{ minutes }} min read</template>
      </p>
    </div></header>

    <div v-if="image" class="wrap mt-[clamp(24px,4vw,40px)]">
      <figure class="mx-auto max-w-[1040px] m-0">
        <img :src="image" :alt="imageAlt" class="block w-full aspect-[16/9] object-cover bg-paper-3">
      </figure>
    </div>

    <div class="wrap"><div class="mx-auto max-w-[760px] mt-[clamp(24px,4vw,40px)] flex flex-col gap-8">
      <!-- Drupal's processed body, styled by the prose rules. -->
      <div class="prose article-body" v-html="body" />

      <ul v-if="tags.length" class="flex flex-wrap gap-2 p-0 m-0 list-none" aria-label="Tags">
        <li v-for="tag in tags" :key="tag" class="font-mono text-11px tracking-wide uppercase border border-solid border-line-2 rounded-full px-3 py-1 text-ink-2">{{ tag }}</li>
      </ul>

      <client-only>
        <DruxtDemoNote
          match="/jsonapi/node/article"
          file="nuxt/components/druxt/entity/node/article/Default.vue"
          body="A Drupal article, found by its path through Decoupled Router and rendered by a Vue component chosen for its bundle."
        />
      </client-only>
    </div></div>

    <section v-if="more.length" class="wrap mt-[clamp(48px,7vw,80px)] flex flex-col gap-5" aria-labelledby="keep-reading">
      <div class="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="keep-reading" class="text-[clamp(21px,3vw,26px)]">Keep reading</h2>
        <NuxtLink to="/blog" class="text-14px font-600 text-accent">All posts &rarr;</NuxtLink>
      </div>
      <div class="grid gap-[clamp(12px,1.6vw,20px)] sm:grid-cols-2">
        <NuxtLink
          v-for="post in more"
          :key="post.id"
          :to="post.path"
          class="card overflow-hidden grid grid-cols-[112px_1fr] sm:grid-cols-[176px_1fr] group hover:border-line-2 transition-colors duration-150"
        >
          <div class="bg-paper-3 overflow-hidden min-h-32">
            <img v-if="post.image" :src="post.image" alt="" loading="lazy" class="w-full h-full object-cover">
          </div>
          <div class="p-4 sm:p-5 flex flex-col gap-2">
            <p class="label-mono">{{ post.date }}</p>
            <h3 class="text-16px font-600 leading-snug group-hover:underline">{{ post.title }}</h3>
            <p v-if="post.summary" class="text-13px text-ink-2">{{ post.summary }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>
  </article>
</template>

<script>
import { DruxtEntityMixin } from 'druxt-entity'
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'
import { postDate } from '~/lib/dates'
import { canonicalUrl } from '~/lib/site'
import { seoHead, articleGraph, breadcrumbGraph, clampDescription } from '~/utils/seo'

const formatDate = (iso) => postDate(iso, 'long')

// A blog post: Kickstart's article bundle with its image and tags.
export default {
  name: 'DruxtEntityNodeArticleDefault',

  mixins: [DruxtEntityMixin],

  data: () => ({ image: '', imageAlt: '', tags: [], more: [] }),

  async fetch() {
    // A preview's image and tags are the unsaved ones the preview seeded into
    // the store, read through the previewed node's own relationships. A saved
    // post takes them in one request.
    const previewing = (this.$store.state.druxtNodePreview || {}).active
    const own = previewing
      ? this.fromPreview()
      : this.$store.dispatch('druxt/getCollection', {
        type: 'node--article',
        query: new DrupalJsonApiParams().addFilter('id', this.entity.id).addInclude(['field_image', 'field_tags']),
      })
    const [self, latest] = await Promise.all([
      own,
      this.$store.dispatch('druxt/getCollection', {
        type: 'node--article',
        query: new DrupalJsonApiParams()
          .addFilter('status', '1')
          .addFilter('id', this.entity.id, '<>')
          .addSort('created', 'DESC')
          .addPageLimit(2)
          .addInclude(['field_image']),
      }),
    ])

    const resolve = (doc) => (ref) => (ref ? (doc.included || []).find((r) => r.id === ref.id && r.type === ref.type) : undefined)

    const node = (self.data || [])[0] || {}
    const find = resolve(self)
    const rels = node.relationships || {}
    const file = find((rels.field_image || {}).data)
    this.image = (((file || {}).attributes || {}).uri || {}).url || ''
    this.imageAlt = ((rels.field_image || {}).data || {}).meta?.alt || ''
    this.tags = ((rels.field_tags || {}).data || []).map((ref) => ((find(ref) || {}).attributes || {}).name).filter(Boolean)

    const findLatest = resolve(latest)
    this.more = (latest.data || []).map((n) => {
      const attrs = n.attributes || {}
      const img = findLatest(((n.relationships || {}).field_image || {}).data)
      return {
        id: n.id,
        title: attrs.title,
        path: (attrs.path || {}).alias || `/node/${attrs.drupal_internal__nid}`,
        summary: (attrs.body || {}).summary || '',
        date: formatDate(attrs.created),
        image: (((img || {}).attributes || {}).uri || {}).url || '',
      }
    })
  },

  methods: {
    // The previewed node as a one-item collection, its includes from the store.
    async fromPreview() {
      const rels = (this.entity || {}).relationships || {}
      const refs = [(rels.field_image || {}).data, ...((rels.field_tags || {}).data || [])].filter((r) => r && r.id)
      const docs = await Promise.all(refs.map((r) => this.$store.dispatch('druxt/getResource', { type: r.type, id: r.id })))
      return { data: [this.entity], included: docs.map((d) => (d || {}).data).filter(Boolean) }
    },
  },

  // The post's own image is the share image, and its summary the
  // description when it has one.
  head() {
    const origin = this.$config.siteOrigin
    const path = this.$route.path
    const url = canonicalUrl(origin, path)
    const description = clampDescription((this.attrs.body || {}).summary || this.body)
    const { title, image, tags } = this
    return seoHead({
      origin,
      path,
      title,
      description,
      image,
      type: 'article',
      graphs: [
        articleGraph({ origin, url, title, description, image, created: this.attrs.created, changed: this.attrs.changed, tags }),
        breadcrumbGraph(origin, [
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
          { name: title, path: url },
        ]),
      ],
    })
  },

  computed: {
    attrs: ({ entity }) => (entity || {}).attributes || {},
    title: ({ attrs }) => attrs.title || '',
    date: ({ attrs }) => formatDate(attrs.created),
    body: ({ attrs }) => (attrs.body || {}).processed || '',
    minutes: ({ body }) => {
      const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
      return words ? Math.max(1, Math.round(words / 220)) : 0
    },
  },
}
</script>
