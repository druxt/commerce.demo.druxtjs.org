# Node 16 to match .nvmrc and mise.toml. npm, not yarn: this project has a
# package-lock.json and declares npm in packageManager.

# Only what the install reads, so a code change reuses the installed
# dependencies. patch-package runs from postinstall, so the patches come too.
FROM uselagoon/node-16-builder:latest AS manifests
COPY ./nuxt/ /nuxt/
RUN mkdir /manifests && cd /nuxt \
  && cp package.json package-lock.json /manifests/ \
  && if [ -d patches ]; then cp -R patches /manifests/patches; fi

FROM uselagoon/node-16-builder:latest AS deps
COPY --from=manifests /manifests /app/
WORKDIR /app
RUN npm ci

FROM uselagoon/node-16:latest
COPY --from=deps --chown=10000:0 /app /app
COPY --chown=10000:0 ./nuxt/ /app/
WORKDIR /app

# No build here: the site is generated when the container starts, against
# this environment's own Drupal, which does not exist while the image builds.
# See server/start.js.
ENV HOST=0.0.0.0 PORT=3000 DRUPAL_URL=http://nginx:8080
EXPOSE 3000

CMD ["node", "server/start.js"]
