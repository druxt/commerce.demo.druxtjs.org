import { resolve, join } from 'path';
import merge from 'deepmerge';
import { DrupalJsonApiParams } from 'drupal-jsonapi-params';
import { DruxtClient } from 'druxt';
import md5 from 'md5';
import Vue from 'vue';
import { DruxtEntityContextMixin } from 'druxt-entity';

async function DruxtViewsStorybook({ stories }) {
  const { addTemplate, options } = this;
  const druxt = new DruxtClient(options.druxt.baseUrl, { ...options.druxt, proxy: { api: false } });
  const resourceType = "view--view";
  const query = new DrupalJsonApiParams().addFilter("status", 1).addFields(resourceType, ["display", "description", "drupal_internal__id", "label"]);
  const collections = (await druxt.getCollectionAll(resourceType, query)).map((collection) => collection.data).flat();
  const views = {};
  for (const view of collections) {
    const { description, display, drupal_internal__id, label } = view.attributes;
    const displays = Object.values(display).filter((item) => {
      const options2 = item.id === "default" ? item : merge(display.default, item);
      const extenders = options2.display_options.display_extenders;
      const enabled = !(!Array.isArray(extenders) && !(extenders.jsonapi_views || {}).enabled);
      return enabled ? options2.display_options.row.type.startsWith("entity:") : false;
    });
    if (displays.length) {
      views[drupal_internal__id] = {
        description,
        displays,
        uuid: view.id,
        viewId: drupal_internal__id,
        label
      };
    }
  }
  addTemplate({
    src: resolve(__dirname, `../templates/druxt-views.stories.js`),
    fileName: `stories/druxt-views.stories.js`,
    options: { views }
  });
  stories.push(resolve(options.buildDir, "./stories/druxt-views.stories.js"));
  for (const viewId of Object.keys(views)) {
    const { description, displays, label, uuid } = views[viewId];
    displays.sort((a) => a.id === "default" ? -1 : 0);
    const title = ["Druxt", "Views", label].join("/");
    addTemplate({
      src: resolve(__dirname, "../templates/druxt-views.instance.stories.js"),
      fileName: `stories/druxt-views.${viewId}.stories.js`,
      options: { description, displays, label, title, uuid, viewId }
    });
  }
  stories.push(resolve(options.buildDir, "./stories/druxt-views.*.stories.js"));
}

const routeName = (pattern) => {
  const slug = pattern.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `druxt-views-page-${slug || "index"}`;
};

const extendComponent = (component) => ({ ...component, isAsync: false });
const DruxtViewsNuxtModule = async function(moduleOptions = {}) {
  const options = {
    baseUrl: moduleOptions.baseUrl,
    ...(this.options || {}).druxt || {},
    views: {
      query: {},
      ...((this.options || {}).druxt || {}).views,
      ...moduleOptions
    }
  };
  this.nuxt.hook("components:dirs", (dirs) => {
    dirs.push({ path: join(__dirname, "components"), extendComponent });
    dirs.push({ path: join(__dirname, "components/blocks"), extendComponent });
  });
  await this.addModule(["druxt", options]);
  const modules = ["druxt-entity", "druxt-schema"];
  for (const module of modules) {
    await this.addModule([module, { baseUrl: options.baseUrl }]);
  }
  const pages = options.views.pages || {};
  if (Object.keys(pages).length) {
    this.extendRoutes((routes) => {
      for (const pattern of Object.keys(pages).reverse()) {
        if (routes.some((route) => route.name === routeName(pattern)))
          continue;
        routes.unshift({
          name: routeName(pattern),
          path: pattern,
          component: resolve(__dirname, "components/DruxtViewsPage.vue"),
          chunkName: "druxt-views-page",
          meta: { druxtViewsPage: pattern }
        });
      }
    });
  }
  this.addPlugin({
    src: resolve(__dirname, "../templates/pages.js"),
    fileName: "druxt-views-pages.js",
    options: { pages }
  });
  this.addPlugin({
    src: resolve(__dirname, "../templates/store.js"),
    fileName: "store/druxt-views.js",
    options: options.druxt
  });
  options.store = true;
  this.nuxt.hook("storybook:config", async ({ stories }) => {
    await DruxtViewsStorybook.call(this, { stories });
  });
};

const DruxtViewsStore = ({ store }) => {
  if (typeof store === "undefined") {
    throw new TypeError("Vuex store not found.");
  }
  const namespace = "druxt/views";
  const generation = { value: 0 };
  const module = {
    namespaced: true,
    state: () => ({
      results: {}
    }),
    mutations: {
      addResults(state, { results, viewId, displayId, prefix, hash }) {
        if (!results || !viewId || !displayId || !hash)
          return;
        if (!state.results[viewId])
          Vue.set(state.results, viewId, {});
        if (!state.results[viewId][displayId])
          Vue.set(state.results[viewId], displayId, {});
        if (!state.results[viewId][displayId][prefix])
          Vue.set(state.results[viewId][displayId], prefix, {});
        Vue.set(state.results[viewId][displayId][prefix], hash, results);
      },
      flushResults(state, { viewId, displayId, prefix, hash }) {
        generation.value += 1;
        if (!viewId)
          Vue.set(state, "results", {});
        else if (viewId && !displayId && !prefix && !hash)
          Vue.set(state.results, viewId, {});
        else if (viewId && displayId && !prefix && !hash)
          Vue.set(state.results[viewId], displayId, {});
        else if (viewId && displayId && prefix && !hash)
          Vue.set(state.results[viewId][displayId], prefix, {});
        else if (viewId && displayId && (prefix || prefix === void 0) && hash)
          Vue.set(state.results[viewId][displayId][prefix], hash, {});
      }
    },
    actions: {
      async getResults({ commit, state }, { viewId, displayId, query, prefix, bypassCache = false }) {
        const hash = query ? md5(this.$druxt.buildQueryUrl("", query)) : "_default";
        let cache;
        if (typeof (((state.results[viewId] || {})[displayId] || {})[prefix] || {})[hash] !== "undefined") {
          cache = state.results[viewId][displayId][prefix][hash];
          if (!bypassCache)
            return cache;
        }
        const since = generation.value;
        try {
          const results = await this.$druxt.getResource(`views--${viewId}`, displayId, query, prefix);
          if (since === generation.value)
            commit("addResults", { results, viewId, displayId, prefix, hash });
          return results;
        } catch (e) {
          return cache ? cache : false;
        }
      }
    }
  };
  store.registerModule(namespace, module, {
    preserveState: Boolean(store.state[namespace])
  });
};

const DruxtViewsFilterMixin = {
  props: {
    filter: {
      type: Object,
      default: () => ({})
    },
    value: {
      type: [Array, Boolean, Number, String],
      default: void 0
    }
  },
  data() {
    return {
      model: this.value
    };
  },
  watch: {
    model(to, from) {
      if (to !== from) {
        this.$emit("input", this.model);
      }
    }
  }
};

const DruxtViewsFiltersMixin = {
  props: {
    filters: {
      type: Array,
      default: () => []
    },
    options: {
      type: Object,
      default: () => ({})
    },
    type: {
      type: String,
      default: "basic"
    },
    value: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      model: this.value
    };
  }
};

const DruxtViewsPagerMixin = {
  props: {
    count: {
      type: [Boolean, Number],
      default: false
    },
    options: {
      type: Object,
      default: () => ({})
    },
    resource: {
      type: Object,
      default: () => ({})
    },
    type: {
      type: String,
      default: "none"
    },
    value: {
      type: Number,
      default: 0
    }
  },
  data() {
    return {
      model: this.value
    };
  },
  watch: {
    model(to, from) {
      if (to !== from) {
        this.$emit("input", this.model);
      }
    }
  }
};

const DruxtViewsSortsMixin = {
  props: {
    options: {
      type: Object,
      default: () => ({})
    },
    sorts: {
      type: Array,
      default: () => []
    },
    type: {
      type: String,
      default: "basic"
    },
    value: {
      type: String,
      default: void 0
    }
  },
  data() {
    return {
      model: this.value
    };
  },
  watch: {
    model(to, from) {
      if (to !== from) {
        this.$emit("input", this.model);
      }
    }
  }
};

const DruxtViewsViewMixin = {
  mixins: [DruxtEntityContextMixin],
  props: {
    count: {
      type: Number,
      require: true
    },
    display: {
      type: Object,
      require: true
    },
    langcode: {
      type: String,
      default: void 0
    },
    mode: {
      type: [Boolean, String],
      default: "default"
    },
    pager: {
      type: Object,
      require: true
    },
    results: {
      type: Array,
      require: true
    },
    value: {
      type: Object,
      default: () => ({
        page: null
      })
    },
    view: {
      type: Object,
      require: true
    }
  },
  data() {
    return {
      model: this.value
    };
  },
  watch: {
    model() {
      this.$emit("input", this.model);
    }
  }
};

DruxtViewsNuxtModule.meta = require("../package.json");

export { DruxtViewsFilterMixin, DruxtViewsFiltersMixin, DruxtViewsPagerMixin, DruxtViewsSortsMixin, DruxtViewsStore, DruxtViewsViewMixin, DruxtViewsNuxtModule as default };
