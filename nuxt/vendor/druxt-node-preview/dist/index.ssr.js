'use strict';

const path = require('path');

const NuxtModule = function(moduleOptions = {}) {
  var _a;
  const options = {
    path: "/druxt/node/preview",
    include: [],
    layouts: [],
    ...((_a = (this.options || {}).druxt) == null ? void 0 : _a.nodePreview) || {},
    ...moduleOptions
  };
  this.options.store = true;
  this.addTemplate({
    src: path.resolve(__dirname, "../templates/DruxtNodePreview.vue"),
    fileName: "components/druxt-node-preview.vue"
  });
  const { dst } = this.addTemplate({
    src: path.resolve(__dirname, "../templates/DruxtNodePreviewPage.vue"),
    fileName: "components/druxt-node-preview-page.vue"
  });
  this.extendRoutes((routes, resolveRoute) => {
    routes.push({
      name: "druxt-node-preview",
      path: options.path,
      component: resolveRoute(this.options.buildDir, dst)
    });
  });
  this.addPlugin({
    src: path.resolve(__dirname, "../templates/plugin.js"),
    fileName: "druxt-node-preview.js",
    options: {
      include: options.include,
      layouts: options.layouts
    }
  });
};

module.exports = NuxtModule;
