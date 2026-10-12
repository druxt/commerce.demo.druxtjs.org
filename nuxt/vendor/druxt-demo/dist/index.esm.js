import { resolve, join } from 'path';

const DruxtDemoModule = function(moduleOptions = {}) {
  const options = {
    source: "",
    docs: "",
    discord: "",
    notice: "",
    reset: "",
    css: true,
    ...this.options.druxtDemo || {},
    ...moduleOptions
  };
  this.options.build.transpile = this.options.build.transpile || [];
  if (!this.options.build.transpile.includes("@druxt/demo")) {
    this.options.build.transpile.push("@druxt/demo");
  }
  if (options.css) {
    this.options.css = this.options.css || [];
    this.options.css.push(resolve(__dirname, "assets/demo.css"));
  }
  this.addPlugin({
    src: resolve(__dirname, "../templates/plugin.js"),
    fileName: "druxt-demo/plugin.js",
    // On the server too: the requests a page's render makes are handed to
    // the browser through the Nuxt payload.
    mode: "all",
    options: {
      // By path: webpack 4 ignores the package's `exports` map.
      runtime: resolve(__dirname, "runtime/demo.js"),
      source: options.source,
      docs: options.docs,
      discord: options.discord,
      notice: options.notice,
      reset: options.reset ? this.nuxt.resolver.resolvePath(options.reset) : resolve(__dirname, "runtime/no-reset.js")
    }
  });
  this.nuxt.hook("components:dirs", (dirs) => {
    dirs.push({ path: join(__dirname, "components") });
  });
};

export { DruxtDemoModule as default };
