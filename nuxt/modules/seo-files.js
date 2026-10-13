import fs from 'fs'
import path from 'path'
import axios from 'axios'

/**
 * What search engines, share cards and assistants read. The router's route
 * renders components/DruxtPage.vue, which gives every Drupal path the
 * storefront's head. Every product and article Drupal holds is a route to
 * generate, so a post no page links to still gets its page. On
 * `generate:done`, robots.txt, sitemap.xml, llms.txt and llms-full.txt go
 * into the export, built from the routes the run wrote and from Drupal's
 * content.
 */
export default function () {
  const get = async (url) => (await axios.get(url, { headers: { Accept: 'application/vnd.api+json' } })).data
  let content = null
  const readAll = () => {
    const { readContent } = require('../lib/seo-content')
    // A failed read is not kept, so the next one asks Drupal again.
    content =
      content ||
      readContent(this.options.druxt.baseUrl, get).catch((error) => {
        content = null
        throw error
      })
    return content
  }

  // Registered after druxt-site, whose router module adds the route.
  this.extendRoutes((routes) => {
    for (const route of routes) {
      if (String(route.name || '').startsWith('druxt-router')) {
        route.component = path.resolve(this.options.srcDir, 'components/DruxtPage.vue')
      }
    }
  })

  this.nuxt.hook('generate:extendRoutes', async (routes) => {
    const known = new Set(routes.map(({ route }) => route))
    for (const { path: route } of await readAll()) {
      if (!known.has(route)) routes.push({ route, payload: null })
    }
  })

  this.nuxt.hook('generate:done', async (generator) => {
    const { siteOrigin } = require('../lib/site')
    const { buildLlmsTxt } = require('../lib/llms-txt')
    const { buildLlmsFullTxt } = require('../lib/llms-full-txt')
    const { buildSitemap, buildRobots } = require('../lib/sitemap')

    const origin = siteOrigin()
    const dir = generator.nuxt.options.generate.dir
    const docs = await readAll()
    const routes = [...(generator.generatedRoutes || [])]

    const files = {
      'robots.txt': buildRobots({ origin }),
      'sitemap.xml': buildSitemap(routes, { origin }),
      'llms.txt': buildLlmsTxt(docs, { origin }),
      'llms-full.txt': buildLlmsFullTxt(docs, { origin }),
    }
    for (const [name, body] of Object.entries(files)) {
      await fs.promises.writeFile(path.join(dir, name), body)
    }
    // The next run, after a reset or an edit, reads Drupal afresh.
    content = null
    console.info(
      `seo-files: wrote ${Object.keys(files).join(', ')} for ${routes.length} routes and ${docs.length} documents at ${origin}`
    )
  })
}
