<script>

import DruxtModule from 'druxt/dist/components/DruxtModule.vue'

/**
 * "How this page works": a line of prose, and the request the page made,
 * read from the request log rather than typed by hand. The prose is a prop,
 * since a DruxtModule's default slot replaces its output. Themed by
 * `DruxtDemoNoteDefault`.
 *
 * @example @lang vue
 * <DruxtDemoNote
 *   match="/jsonapi/node/recipe"
 *   file="pages/recipes.vue"
 *   body="One request fetched every recipe. The filters work on that collection."
 * />
 */
export default {
  name: 'DruxtDemoNote',

  extends: DruxtModule,

  props: {
    /** A substring of the request URL this note describes. */
    match: { type: String, required: true },
    /** The note's prose. */
    body: { type: String, default: '' },
    /** The small heading above the note. */
    kicker: { type: String, default: 'How this page works' },
    /** An optional title. */
    title: { type: String, default: '' },
    /** The repository path of the component the note describes. */
    file: { type: String, default: '' },
    /** The call to action's text. */
    cta: { type: String, default: 'Read the guide' },
    /** An internal link for the call to action. */
    to: { type: String, default: '' },
    /** An external link for the call to action, when there is no `to`. */
    href: { type: String, default: '' },
  },

  computed: {
    /** The latest logged request whose URL includes `match`. */
    request: ({ $druxtDemo, match }) =>
      [...(($druxtDemo || {}).requests || [])]
        .reverse()
        .find((r) => r.url.includes(match)) || null,
  },

  druxt: {
    componentOptions: () => [['default']],

    propsData: ({
      match,
      body,
      kicker,
      title,
      file,
      cta,
      to,
      href,
      request,
    }) => ({
      match,
      body,
      kicker,
      title,
      file,
      cta,
      to,
      href,
      request,
    }),

    slots(h) {
      const p = this.component.propsData
      const r = p.request
      return {
        default: () =>
          h('aside', { class: 'druxt-demo-note' }, [
            h('span', { class: 'druxt-demo-note__kicker' }, p.kicker),
            p.title
              ? h('h3', { class: 'druxt-demo-note__title' }, p.title)
              : null,
            p.body ? h('p', { class: 'druxt-demo-note__body' }, p.body) : null,
            r
              ? h('p', { class: 'druxt-demo-note__request' }, [
                  `${r.method} ${r.url}`,
                  h('br'),
                  `${r.status} in ${r.ms} ms, cache: ${r.cache || 'none'}`,
                ])
              : h(
                  'p',
                  { class: 'druxt-demo-note__request' },
                  'No request was made for this yet.'
                ),
            p.file
              ? h('code', { class: 'druxt-demo-note__file' }, p.file)
              : null,
            p.to
              ? h(
                  'NuxtLink',
                  { props: { to: p.to }, class: 'druxt-demo-note__link' },
                  p.cta
                )
              : null,
            !p.to && p.href
              ? h(
                  'a',
                  {
                    attrs: { href: p.href, rel: 'noopener', target: '_blank' },
                    class: 'druxt-demo-note__link',
                  },
                  p.cta
                )
              : null,
          ]),
      }
    },
  },
}
</script>
