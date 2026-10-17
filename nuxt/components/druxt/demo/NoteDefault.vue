<template>
  <aside class="border border-line border-l-3 border-l-accent bg-paper-3 px-4 py-3.5 text-13px leading-relaxed">
    <span class="block font-mono text-10px tracking-widest uppercase text-accent mb-2">{{ kicker }}</span>
    <h3 v-if="title" class="text-15px font-600 mb-1.5">{{ title }}</h3>
    <p v-if="body" class="text-ink-2 m-0">{{ body }}</p>
    <!-- Read from the request log, so it says what the page did, not what a
         page author remembers it doing. -->
    <p v-if="request" class="font-mono text-11px text-ink-2 mt-3 mb-0 break-all">
      {{ request.method }} {{ request.url }}<br>
      {{ request.status }} in {{ request.ms }} ms on the {{ request.where }}, cache: {{ request.cache || 'none' }}
    </p>
    <p v-else class="font-mono text-11px text-ink-2 mt-3 mb-0">No request was made for this yet.</p>
    <code v-if="file" class="block font-mono text-11px mt-2 break-all">{{ file }}</code>
    <a v-if="href" :href="href" rel="noopener" target="_blank" class="inline-block mt-2 text-accent font-600">{{ cta }}</a>
  </aside>
</template>

<script>
export default {
  name: 'DruxtDemoNoteDefault',

  props: {
    match: { type: String, default: '' },
    body: { type: String, default: '' },
    kicker: { type: String, default: 'How this page works' },
    title: { type: String, default: '' },
    file: { type: String, default: '' },
    cta: { type: String, default: '' },
    to: { type: String, default: '' },
    href: { type: String, default: '' },
    request: { type: Object, default: null },
  },
}
</script>
