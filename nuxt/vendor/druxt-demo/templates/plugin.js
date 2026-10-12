import Vue from 'vue'
import {
  attachRequestLog,
  createDemo,
  installOverlay,
} from '<%= options.runtime %>'
import reset from '<%= options.reset %>'

const options = <%= JSON.stringify({ source: options.source, docs: options.docs, discord: options.discord, notice: options.notice }) %>

export default (context, inject) => {
  const server = process.server
  // The browser starts from the requests the server made for this page, so
  // a note can name a request the page never had to repeat.
  const requests = server ? [] : (context.nuxtState || {}).druxtDemo || []
  const demo = createDemo({ ...options, reset, requests }, Vue)
  inject('druxtDemo', demo)
  if (context.$druxt && context.$druxt.axios) {
    attachRequestLog(context.$druxt.axios, demo, {
      where: server ? 'server' : 'browser',
    })
  }
  if (server) {
    context.beforeNuxtRender(({ nuxtState }) => {
      nuxtState.druxtDemo = demo.requests
    })
  } else {
    installOverlay(Vue, demo)
  }
}
