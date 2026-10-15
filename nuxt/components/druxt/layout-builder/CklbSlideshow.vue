<template>
  <section
    class="relative"
    role="group"
    :aria-roledescription="multiple ? 'carousel' : undefined"
    :aria-label="label"
  >
    <!--
      Drupal renders cklb_slideshow as a carousel: one slide at a time. The
      scaffold rendered every slot stacked, which showed three heroes at once.

      Controls sit in a bar below the slide rather than floating over it. The
      same component serves the hero, which is dark and full-bleed with a
      headline in the top left, and the product rails, which are light cards.
      Anything overlaid is over content in one of those two cases: the first
      version put the arrows straight through the hero headline.
    -->
    <!--
      Every slide occupies the same grid cell, so the carousel is always as
      tall as its tallest slide and the page does not jump as you move through
      it. `v-show` alone let each slide set the height on its way in, which
      shifted everything below by a few hundred pixels per press.

      Hidden slides keep their space but are removed from the accessibility
      tree and from the tab order.
    -->
    <!-- Product rails name themselves, so a light slideshow is a row of tabs. -->
    <div v-if="tabbed" class="wrap pt-[clamp(36px,5vw,56px)] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div class="flex gap-x-[clamp(16px,2.4vw,28px)] max-w-full overflow-x-auto whitespace-nowrap" role="tablist" aria-label="Products" @keydown="onTabKey">
        <button
          v-for="(slot, index) in slides"
          :id="`tab-${slot}`"
          :key="`tab-${slot}`"
          ref="tabs"
          type="button"
          role="tab"
          :aria-selected="index === current ? 'true' : 'false'"
          :aria-controls="`panel-${slot}`"
          :tabindex="index === current ? 0 : -1"
          class="pb-2 -mb-px border-0 border-b-2 border-solid bg-transparent px-0 shrink-0 text-[clamp(18px,3vw,26px)] font-700 tracking-tight leading-tight cursor-pointer transition-colors duration-150"
          :class="index === current ? 'text-ink border-ink' : 'text-ink-3 border-transparent hover:text-ink'"
          @click="current = index"
        >{{ titles[slot] }}</button>
      </div>
      <NuxtLink to="/catalogue" class="pb-2 text-14px font-600 text-accent">Browse all products &rarr;</NuxtLink>
    </div>

    <div class="grid">
      <div
        v-for="(slot, index) in slides"
        :id="tabbed ? `panel-${slot}` : undefined"
        :key="slot"
        class="col-start-1 row-start-1 min-w-0"
        :class="index === current ? 'visible' : 'invisible pointer-events-none'"
        :role="tabbed ? 'tabpanel' : undefined"
        :aria-labelledby="tabbed ? `tab-${slot}` : undefined"
        :aria-hidden="index === current ? 'false' : 'true'"
      >
        <slot :name="slot" />
      </div>
    </div>

    <!--
      On a dark full-bleed slide the bar sits inside it, aligned to the same
      grid as the headline, because a control bar on the page ground below
      reads as belonging to the next section rather than to the slide. On a
      light slide it sits below, where there is no image to fight with.
    -->
    <div
      v-if="multiple && !tabbed"
      class="wrap flex items-center gap-4"
      :class="onDark
        ? 'absolute bottom-0 left-0 right-0 pb-6 text-paper'
        : 'pb-6 text-ink'"
    >
      <!-- Progress reads as a measure of the whole, not just a position. -->
      <div class="flex-1 flex gap-1.5" aria-hidden="true">
        <span
          v-for="(slot, index) in slides"
          :key="`bar-${slot}`"
          class="h-0.5 flex-1 transition-colors duration-200"
          :class="index === current ? (onDark ? 'bg-paper' : 'bg-ink') : (onDark ? 'bg-paper/30' : 'bg-ink/20')"
        />
      </div>

      <p class="label-mono tabular-nums" :class="onDark ? 'text-paper/80' : 'text-ink-2'">
        {{ current + 1 }} / {{ slides.length }}
      </p>

      <div class="flex gap-1">
        <button
          type="button"
          class="w-11 h-11 flex items-center justify-center rounded border transition-colors duration-150"
          :class="onDark
            ? 'bg-transparent border-paper/40 hover:border-paper hover:bg-paper/15'
            : 'bg-paper border-line hover:border-ink'"
          aria-label="Previous slide"
          @click="previous"
        >&#8592;</button>

        <button
          type="button"
          class="w-11 h-11 flex items-center justify-center rounded border transition-colors duration-150"
          :class="onDark
            ? 'bg-transparent border-paper/40 hover:border-paper hover:bg-paper/15'
            : 'bg-paper border-line hover:border-ink'"
          aria-label="Next slide"
          @click="next"
        >&#8594;</button>
      </div>
    </div>

    <!-- Slide choice for assistive technology and keyboard users, without the
         visual weight of a row of dots. -->
    <div v-if="multiple && !tabbed" class="sr-only">
      <button
        v-for="(slot, index) in slides"
        :key="`goto-${slot}`"
        type="button"
        :aria-current="index === current ? 'true' : 'false'"
        @click="current = index"
      >Show slide {{ index + 1 }} of {{ slides.length }}</button>
    </div>
  </section>
</template>

<script>
export default {
  name: 'DruxtLayoutBuilderCklbSlideshow',

  // A product rail in a slide gives its title here, keyed by the uuid its
  // slot is named after.
  provide() {
    return { rail: { setTitle: (uuid, title) => this.$set(this.titles, uuid, title) } }
  },

  data: () => ({
    current: 0,
    slides: [],
    titles: {},
    onDark: false,
  }),

  computed: {
    multiple: ({ slides }) => slides.length > 1,

    tabbed: ({ multiple, slides, titles }) => multiple && slides.every((s) => titles[s]),

    label: ({ slides, tabbed }) => (slides.length > 1 && !tabbed ? `Slideshow, ${slides.length} slides` : undefined),
  },

  // $scopedSlots is a new object on every render, so reading it from a
  // computed never settles and blows the stack. It is captured before the
  // first render and refreshed only when the slot names actually change.
  created() {
    this.syncSlides()
  },

  beforeUpdate() {
    this.syncSlides()
  },

  mounted() {
    // The hero slideshow is dark and full bleed; the product rails are light.
    // Rather than pass a variant down through Druxt's slot machinery, the
    // control bar reads the slide it is describing.
    // Ask whether the slide paints the dark ground, rather than measuring a
    // computed colour. The first version read getComputedStyle on the slide's
    // direct child and worked out its luma, and it silently answered "light"
    // for the hero: too many ways for the element it measured not to be the
    // one carrying the background. This asks the question directly and either
    // finds the token or does not.
    const slide = this.$el.querySelector('[aria-hidden="false"]')
    this.onDark = !!(slide && slide.querySelector('.bg-ink'))
  },

  methods: {
    syncSlides() {
      const names = Object.keys(this.$scopedSlots || {})
      if (names.length !== this.slides.length || names.some((n, i) => n !== this.slides[i])) {
        this.slides = names
        if (this.current >= names.length) this.current = 0
      }
    },

    next() {
      if (!this.multiple) return
      this.current = (this.current + 1) % this.slides.length
    },

    previous() {
      if (!this.multiple) return
      this.current = (this.current - 1 + this.slides.length) % this.slides.length
    },

    // Arrow keys move along the tabs, Home and End jump to the ends.
    onTabKey(event) {
      const last = this.slides.length - 1
      const moves = { ArrowRight: this.next, ArrowLeft: this.previous, Home: () => (this.current = 0), End: () => (this.current = last) }
      if (!moves[event.key]) return
      event.preventDefault()
      moves[event.key]()
      this.$nextTick(() => this.$refs.tabs && this.$refs.tabs[this.current] && this.$refs.tabs[this.current].focus())
    },
  },
}
</script>
