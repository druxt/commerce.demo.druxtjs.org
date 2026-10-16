// The concierge route under `nuxt dev`. server/start.js serves it in production.
const { createAssistRoute } = require('./index')

module.exports = createAssistRoute({ drupalUrl: process.env.BASE_URL || 'http://127.0.0.1:18961' })
