# @druxt/demo

The demo layer every Druxt demo installs. A bar that says what the site is
and links to its source, a note on each page showing the request the page
made, a drawer with the JSON:API response, a view-mode switcher, and a reset
back to the fresh demo.

This package is private and is not published. Each demo vendors a packed
build (see below). Publication under `@druxt/*` is planned for 2.0.0.

## Install

```sh
npm run vendor -- ../my-demo/nuxt/vendor/druxt-demo
```

```json
{ "dependencies": { "@druxt/demo": "file:vendor/druxt-demo" } }
```

```js
// nuxt.config.js
export default {
  modules: ['druxt', '@druxt/demo'],
  druxtDemo: {
    source: 'https://github.com/druxt/umami.demo.druxtjs.org',
    docs: 'https://druxtjs.org',
    notice: 'A demo. The daily reset wipes what visitors leave.',
    reset: '~/demo/reset.js',
  },
}
```

| Option    | Default |                                                              |
| --------- | ------- | ------------------------------------------------------------ |
| `source`  | none    | The repository the bar links to                              |
| `docs`    | none    | The documentation link                                       |
| `discord` | none    | The community link                                           |
| `notice`  | none    | One line naming what is live and what the reset wipes        |
| `reset`   | none    | A file whose default export resets the demo. None, no button |
| `css`     | `true`  | Load the default styles                                      |

Register it under `modules`, after `druxt`: the plugin attaches to the
Druxt client the moment it exists.

## The request log

Every request the Druxt client makes is recorded as method, URL, status,
duration, where it was made (`server` or `browser`) and Drupal's
`X-Drupal-Cache` header. Nothing else is read: no request header, no cookie,
and an `access_token` query value is removed from the URL before it is kept.
The requests a page's server render made travel to the browser in the Nuxt
payload, so a note can name a request the page never had to repeat. The
last fifty are held on `$druxtDemo.requests`, and `useDruxtDemo()` returns
the same object from any module.

```js
import { useDruxtDemo } from '@druxt/demo/runtime/demo.js'

const demo = useDruxtDemo()
demo.requests.at(-1) // { method, url, status, ms, cache, where, at }
```

## Components

Each extends `DruxtModule` and is themed the Druxt way: a component named
`DruxtDemo<Name>Default` in the site's `components/druxt/demo/` receives the
props below and replaces the default markup. The props are data. A theme
that needs the module to act emits `input` with the action named below, the
v-model channel every DruxtModule has, and the module does it.

### DruxtDemoBar

```vue
<DruxtDemoBar notice="A demo. The daily reset wipes what visitors leave." />
```

Props `source`, `docs`, `discord` and `notice` default to the module options.
The theme receives them with `overlay`, whether the overlay is on, and
toggles it with `this.$druxtDemo.toggleOverlay()`.

### DruxtDemoNote

```vue
<DruxtDemoNote
  match="/jsonapi/node/recipe"
  file="pages/recipes.vue"
  body="One request fetched every recipe. The filters work on that collection."
/>
```

`match` is a substring of the request URL the note describes. The theme
receives `request`, the latest log entry that matches, or `null`, with
`body`, `kicker`, `title`, `file`, `cta`, `to` and `href`. The default
shows the method, URL, status, duration and cache state, read from the log.
A note whose request has not happened says so.

### DruxtDemoDrawer

```vue
<DruxtDemoDrawer path="/jsonapi/node/recipe?page[limit]=3" />
```

Fetches the path once, on the first open, through the page's own client.
The theme receives `path`, `open`, `response`, `error` and `loading`, and
opens or closes it with `this.$emit('input', 'toggle')`.

### DruxtDemoViewModes

```vue
<DruxtDemoViewModes type="node--recipe" :uuid="uuid" :modes="['card', 'teaser']" />
```

Renders a `DruxtEntity` in the chosen mode. `full` is left out by default,
since a switcher inside a full renderer would nest another copy of it. The
theme receives `type`, `uuid`, `modes` and `mode`, and picks one with
`this.$emit('input', 'teaser')`.

### DruxtDemoReset

```vue
<DruxtDemoReset />
```

Renders nothing unless the `reset` option names a file. The file's default
export is called after the visitor confirms, and may return a string to show.
The theme receives `available`, `open`, `busy` and `message`, and emits
`input` with `start`, `confirm` or `cancel`. The file is imported on the
server as well, so it must load without a browser.

## The overlay

The bar's switch adds `druxt-demo-overlay` to `<html>`, and the plugin tags
every mounted Druxt module component with `data-druxt="<component name>"`.
The default styles outline and label them. The choice is kept in
`localStorage` as `druxt-demo:overlay`.

## Styling

The default styles are custom properties a site overrides:

```css
:root {
  --druxt-demo-ink: #1f2937;
  --druxt-demo-ink-2: #2f495e;
  --druxt-demo-paper: #ffffff;
  --druxt-demo-paper-2: #f4f7fa;
  --druxt-demo-line: #dbe3ec;
  --druxt-demo-accent: #036397;
  --druxt-demo-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

A site with its own styling sets `css: false` and themes the components.

## Vendoring

`npm run vendor -- <dir>` builds, packs and unpacks the package into `<dir>`
with a fresh `0.0.0-dev.<timestamp>` version, so a package manager never
serves a stale copy from its cache. Install in the demo afterwards.

This repository follows the Druxt repository standard, from
[module-template](https://github.com/druxt/module-template).
