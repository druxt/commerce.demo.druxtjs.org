# DruxtNodePreview

Renders Drupal node previews in a [Druxt](https://druxtjs.org) frontend, so an
editor pressing Preview in Drupal sees the unsaved content rendered by the real
frontend, paragraphs included.

Works with two Drupal modules:

- [JSON:API Node Preview](https://www.drupal.org/project/jsonapi_node_preview)
  serves the unsaved preview over JSON:API.
- Consumer Node Preview turns Drupal's preview screen into Frontend, Drupal and
  JSON:API tabs, and frames this module's page in the Frontend tab.

## How it works

1. The editor presses Preview in Drupal. The Frontend tab frames this
   module's page, with the JSON:API preview endpoint in the URL fragment, so
   it never reaches any server log.
2. The page reads the fragment and fetches the endpoint with the editor's
   Drupal session.
3. It seeds the Druxt store with the document and its includes, then renders
   the node through a themeable `DruxtNodePreview` wrapper and `DruxtEntity`.

Because the store is seeded before `DruxtEntity` resolves, the unsaved preview
data renders through the same components as the live site.

## Install

```sh
npm install @druxt-contrib/node-preview
```

It needs Druxt 0.25 and Druxt Entity 0.29 or later. Until they are released,
install their builds from the `dev` tag, for example `npm install druxt-site@dev`.

```js
// nuxt.config.js
export default {
  modules: [
    '@druxt-contrib/node-preview',
    'druxt-site',
  ],
  druxt: {
    baseUrl: 'https://drupal.example.com',
    nodePreview: {
      // The preview page's path. This is the default.
      path: '/druxt/node/preview',
      // Relationships to add to the endpoint's own include. Consumer Node
      // Preview already includes a node's paragraphs, so add what they
      // reference, for example 'field_content.field_media'.
      include: [],
      // Nuxt layouts the preview may render in, picked with ?layout=.
      // List the same names on the consumer in Drupal.
      layouts: [],
    },
  },
}
```

The page's route is named `druxt-node-preview`. The name is stable, so a site
can hook the route.

In Drupal, add a Consumer Node Preview target that points at the page:

```text
https://frontend.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]
```

`vm` carries the view mode, and `layout` the layout picked in the preview's
Layout select. The fragment carries the endpoint.

The page renders in the layout `layout` names, but only when `layouts` lists
it. Any other name, or none, gives the default layout. So a preview URL
cannot put the page in another of the site's layouts. A bare layout, with the
site's type and spacing but no header or footer, suits a preview of content
that sits inside other pages.

## Theming the preview

A live page often wraps the node in more than `DruxtEntity`: a title, a
header, a prose container. The preview gets the same through a wrapper
component, picked like any Druxt wrapper. For a `node--doc_page` previewed in
`full`, the first of these that exists is used:

1. `DruxtNodePreviewDocPageFull`
2. `DruxtNodePreviewDocPage`
3. `DruxtNodePreviewDefault`

In development, a missing wrapper shows Druxt's "Missing Vue template" box,
with a button that creates the file.

A wrapper receives whichever of these props it declares:

- `document`: the whole JSON:API preview document.
- `entity`: the previewed resource, with `attributes` such as the title.
- `mode`, `type` and `uuid`.

Its default slot renders the node with `DruxtEntity`:

```vue
<!-- components/druxt/node-preview/DocPage.vue -->
<template>
  <article class="prose">
    <h1>{{ entity.attributes.title }}</h1>
    <slot />
  </article>
</template>

<script>
export default {
  props: {
    entity: { type: Object, required: true },
  },
}
</script>
```

## Components that fetch their own data

The preview seeds the store, so a component that reads the store renders the
unsaved data. A component that fetches its data again, for example paragraphs
at a revision, would replace the preview with saved content. The plugin
registers a `druxtNodePreview` store module for this. Skip the refetch while a
preview is active:

```js
if ((this.$store.state.druxtNodePreview || {}).active) return
```

The flag does not leak into other pages. Leaving the preview route flushes
every resource the preview seeded from the Druxt store and clears the flag,
before the next page loads. That page then fetches and renders the saved
content.

This needs Druxt 0.25 or later, for the `druxt/flushResource` mutation.

## The request

The page fetches through the Druxt client, `$druxt.axios`, with credentials.
So the site's own request interceptors apply, such as a workspace header, and
the editor's session cookie goes with the request.

An endpoint given as a path stays a path. The Druxt client resolves it against
its own base URL, and interceptors that decide by path still match it. That
suits a frontend that proxies Drupal on its own origin: no CORS, and the
session cookie stays first party. With an absolute endpoint on another origin,
Drupal needs CORS with `supportsCredentials: true` for the frontend origin,
and a `SameSite=None` session cookie.

## Server rendering

The page only works in the browser. The fragment never reaches the server, so
a server render shows "Loading preview…" and the browser fills it in.

## Vendoring

The package ships its built `dist`. A site that vendors a copy instead of
installing it must commit `dist` too, even when the site ignores `dist`
folders.

## Example

See `example/` for a paired Drupal and Nuxt setup.
