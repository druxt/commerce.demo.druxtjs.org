# Node 20: the live hub reads Drupal with fetch, which Node 16 lacks. npm, not yarn: this project has a
# package-lock.json and declares npm in packageManager.

# Only what the install reads, so a code change reuses the installed
# dependencies. patch-package runs from postinstall, so the patches come too,
# with the vendored packages the file: dependencies point at, and .npmrc: the
# lock was made with its install-links, and `npm ci` refuses it without them.
FROM uselagoon/node-20-builder:26.8.0 AS manifests
COPY ./nuxt/ /nuxt/
RUN mkdir /manifests && cd /nuxt \
  && cp package.json package-lock.json .npmrc /manifests/ \
  && for dir in patches vendor; do \
    if [ -d "$dir" ]; then cp -R "$dir" "/manifests/$dir"; fi; \
  done

FROM uselagoon/node-20-builder:26.8.0 AS deps
COPY --from=manifests /manifests /app/
WORKDIR /app
RUN npm ci

FROM uselagoon/node-20:26.8.0
COPY --from=deps --chown=10000:0 /app /app
COPY --chown=10000:0 ./nuxt/ /app/
WORKDIR /app

# No build here: the site is generated when the container starts, against
# this environment's own Drupal, which does not exist while the image builds.
# See server/start.js.
# Nuxt 2's webpack needs OpenSSL's legacy provider on Node 17 and later; the
# site is generated in this container, so the flag is set here.
ENV HOST=0.0.0.0 PORT=3000 DRUPAL_URL=http://nginx:8080 NODE_OPTIONS=--openssl-legacy-provider
EXPOSE 3000

CMD ["node", "server/start.js"]
