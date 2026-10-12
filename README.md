# DruxtSite quickstart - Commerce Kickstart

> Fully Decoupled Drupal + Nuxt starter-kit for decoupled commerce, built on Centarro's Commerce Kickstart.

DruxtSite connects Drupal to Nuxt via JSON:API to provide a framework for building a Fully Decoupled site. This starter-kit pairs it with [Commerce Kickstart](https://www.centarro.io/commerce-kickstart), Centarro's Drupal Commerce distribution, so a `commerce_product`/`commerce_product_variation` catalogue with real demo pricing is available out of the box.

This repository provides:

- Drupal 11 with Commerce Kickstart 5 (demo content included)
- Nuxt 2
- DruxtSite

The repository is
[druxt/commerce.demo.druxtjs.org](https://github.com/druxt/commerce.demo.druxtjs.org).
It has not been renamed to match the starterkit yet, so the clone URL
below reads differently from the directory it creates.

## Getting started

Requires [Node 16](.nvmrc) and one of:

- PHP 8.3 or newer (with the pdo_sqlite extension) + Composer on your
  machine
  (Drush comes with the backend - no global install needed), or
- [DDEV](https://ddev.readthedocs.io) or [Lando](https://lando.dev) (Docker)

On Windows, use the dev container, WSL2, or a container backend - see
[Windows](#windows).

[nvm](https://github.com/nvm-sh/nvm) or [mise](https://mise.jdx.dev/) users:
`nvm use` / `mise install` provides the pinned versions.

### One-command setup (local PHP + SQLite, no Docker)

1. Clone the repository, then from the repository root:

   ```bash
   git clone https://github.com/druxt/commerce.demo.druxtjs.org.git quickstart-druxt-commerce
   cd quickstart-druxt-commerce
   npm install
   ```

   `npm install` runs the full setup automatically: frontend, Composer,
   and a local Drupal 11 + SQLite backend with Commerce Kickstart and
   its demo content installed. Needs PHP 8.3 or newer and Composer on `PATH`.
   Without them, it installs the frontend only and prints the next
   steps - run `npm run setup` once they're available.

   `make setup` works too, as do `make dev`, `make build`, `make info`,
   `make reset`, etc.

2. Develop against the live backend:

   ```bash
   npm run dev
   ```

   - Drupal backend: http://127.0.0.1:8888
   - Nuxt frontend: http://localhost:3000 (or the next free port up to
     3009, which it prints)
   - One-time Drupal login: `npm run login`

`npm run dev` and `npm run start` both automatically start the local
backend if it is not already running, and leave external backends
alone.

`npm run start` runs the frontend as the hosted demo does: a starting page
while it generates the site against the backend, then the generated site,
with the backend's JSON:API, files and theme assets proxied on the same
origin so the cart's session cookie is first party.

Other commands: `npm run stop`, `npm run reset` (fresh site), `npm run
info`, `npm run login`, `npm run devtools -- <script>` for direct
access to `drupal/.devtools/`. See `drupal/.devtools/README.md` for
what each backend script does.

### Local development with [DDEV](https://ddev.readthedocs.io)

Using DDEV? Keep `BASE_URL` as the `*.ddev.site` URL in `.env`
(`cp drupal/.env.example .env` gives you a starting point). Then:

1. Frontend (from repository root):

   ```bash
   npm run setup
   ```

   Detecting the DDEV `BASE_URL`, this installs the frontend only and
   prints the backend steps.

2. Backend (from `drupal/`):

   ```bash
   ddev start
   ddev drush site:install commerce_kickstart installer_recipes_form.demo=drupal/commerce_kickstart_demo
   ```

3. `npm run dev` as above. The DDEV backend is never auto-started or
   auto-stopped from the npm scripts.

### Local development with [Lando](https://lando.dev)

Set `BASE_URL` in `.env` to your Lando URL
(`https://druxt-quickstart-commerce.lndo.site` for the bundled `drupal/.lando.yml`).
Then:

1. Frontend (from repository root):

   ```bash
   npm run setup
   ```

   Any non-loopback `BASE_URL` is treated as a backend this repo does not
   manage, so this installs the frontend only.

2. Backend (from `drupal/`):

   ```bash
   lando start
   lando drupal-install
   ```

   This runs the same install steps as the DDEV command.

3. `npm run dev` as above. `npm run drush -- <command>` is proxied
   through `lando drush`.

### Troubleshooting

#### Port 3000 is already in use

`npm run dev` takes the next free port between 3000 and 3009 and says
which one it picked, so the frontend address stays knowable.

Naming a port yourself turns that off: `PORT=3005 npm run dev` uses 3005
or fails, because a port you asked for is a decision rather than a
default. If the whole range is busy, `npm run dev` says so instead of
letting Nuxt fall back to a random port.

### Windows

The local PHP backend does not run on Windows directly: it manages a PHP
built-in server with `nohup`, `lsof`, `ps` and `kill`. `npm run setup`
says so rather than failing part-way through.

Any of these work instead, with no changes to the repository:

- the dev container,
- WSL2, running the same commands inside your Linux distribution,
- DDEV or Lando, setting `BASE_URL` to the container URL.

### Development Container (VS Code, DevPod)

`.devcontainer/devcontainer.json` gives you a ready environment: Node
16, PHP 8.4, Composer, and `mise` (config pre-trusted), provisioned
through `drupal/.devtools` (PHP built-in server + SQLite) - no
Docker-in-Docker needed.

| Tool                        | How                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code                     | Clone, open the folder, run **Dev Containers: Reopen in Container**                                                                                                    |
| [DevPod](https://devpod.sh) | `devpod up https://github.com/druxt/commerce.demo.druxtjs.org --id quickstart-druxt-commerce` (CLI), or add the same URL as a workspace source in DevPod's desktop app |

First open runs `npm install` at the repository root, which triggers
the same full setup pipeline as above: frontend dependencies,
Composer, Commerce Kickstart installed with its demo content, and the
backend started and ready. Then:

```bash
npm run dev
```

- Drupal backend: http://127.0.0.1:8888
- Nuxt frontend: http://localhost:3000 (or the next free port up to
  3009, which it prints)

## How to use it

Your environment contains a pre-installed, pre-configured and running
instance of Commerce Kickstart with demonstration products, and Nuxt
with the DruxtSite module enabled.

Query the catalogue over JSON:API directly, e.g.:

```bash
curl http://127.0.0.1:8888/jsonapi/products/physical
```

In a Development Container (VS Code, DevPod), forwarded ports are
accessible via your editor's **Ports** panel.

## Operator console

`operator/` is a second Nuxt app on the same Drupal, for whoever runs a
demo. It signs in through its own Simple OAuth consumer, `commerce_operator`,
with the password grant made by its server so the browser never holds the
consumer's details. An operator starts a demo session and shares its link or
QR code. Visitors who arrive through that link belong to the session, and
the console's order board lists their orders as Drupal holds them, moving
within a second of a checkout or a transition. A console sees only the
sessions it holds.

The board's transitions are JSON:API PATCHes of the order's state. Commerce's
workflow decides, and the console shows Drupal's answer under the row, allowed
or refused. The visitor's order page follows the same order on the live
socket, so the two move together.

Run it beside the storefront:

```bash
cd operator
npm install
BASE_URL=http://127.0.0.1:8888 STOREFRONT_ORIGIN=http://127.0.0.1:3000 PORT=3001 npm run dev
```

The local operator account is `operator`. Its password is `OPERATOR_PASSWORD`
when the backend was provisioned, or `operator`. An account without the role
signs in and is told it cannot operate the store: `shopper`, whose password is
`SHOPPER_PASSWORD` or `shopper`.

In production the console is the `ops` service on its own route, built by
`.docker/Dockerfile.ops` and served by `operator/server/start.js`, which also
proxies Drupal's paths on the console's origin.

## Services

| Port   | Service                                                                               |
| ------ | ------------------------------------------------------------------------------------- |
| `3000` | Nuxt.js                                                                               |
| `3001` | Operator console                                                                      |
| `3003` | Storybook                                                                             |
| `8888` | Drupal (local `.devtools` backend - DDEV serves at its own `*.ddev.site` URL instead) |

## Tools

### Commerce Kickstart

> Centarro's Drupal Commerce distribution: catalogue, cart, checkout, and demo product data out of the box.

`npm run provision` (or `drupal/.devtools/provision`) installs it via
`site:install`, selecting the `drupal/commerce_kickstart_demo` recipe
through the installer's own recipes form - the same path a manual
install through the browser would take.

Refer to the project page for more details: https://www.drupal.org/project/commerce_kickstart

### DDEV

> DDEV is an open-source tool that makes it dead simple to get local PHP development environments up and running within minutes.

DDEV is used to manage the Drupal instance, and provides a CLI that can be used to run common drupal tasks, including `ddev drush`.

These commands should be run from within the `/drupal` folder.

Refer to the documentation for more details: https://ddev.readthedocs.io

### Lando

> Lando is a free, open-source development tool that allows developers to
> easily specify and construct the exact environment they need to build
> their applications.

- [lando.dev](https://lando.dev)
- Config: [drupal/.lando.yml](drupal/.lando.yml)

### @nuxtjs/storybook

> Storybook integration with NuxtJS.

Druxt integrates with the Nuxt Storybook module to provide zero-configuration, auto-discovery stories with access to live data from your Drupal backend.

To start Storybook, navigate to the `nuxt` directory and run `npx nuxt storybook`.

## License

[MIT](https://github.com/druxt/druxt.js/blob/develop/LICENSE)
