Local development without Docker. Just PHP, Composer, and SQLite.

Use this as an alternative to DDEV, not a replacement. Pick whichever fits your workflow.

## Scripts

| Script | What it does |
| --- | --- |
| `assemble` | Install Composer dependencies. |
| `provision` | Install Drupal fresh with the `commerce_kickstart` profile. Enable demo content and `druxt`. |
| `start` | Start the PHP dev server. Write `BASE_URL` to `../.env`. |
| `stop` | Stop the dev server. |
| `info` | Show the current environment: PHP, Drupal, Composer, and Drush versions, webserver, database. |
| `demo-snapshot` | Bash. Keep the fresh database and files in the private files directory. Lagoon runs it after each deploy. |
| `demo-reset` | Bash. Put the database and files back to that snapshot, then ask the storefront to rebuild. Lagoon runs it daily. |
| `helpers.php` | Shared functions the scripts above use. |
| `etc/php.ini` | Raises `memory_limit`. Drupal installs need more than PHP's 128M default. |

## Quick start

```bash
cd drupal
.devtools/assemble
.devtools/provision
.devtools/start
```

Then start the Nuxt frontend:

```bash
cd ../nuxt
npm install
npm run dev
```

Or with `make` (see the `Makefile` in this directory's parent):

```bash
make build   # assemble + provision + start
make stop
make reset   # wipe the database and stop the server
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEBSERVER_HOST` | `127.0.0.1` | PHP server bind host |
| `WEBSERVER_PORT` | auto-discovered (8888+) | PHP server port |
| `DB_FILE` | `/tmp/quickstart-commerce-drupal-site.sqlite` | SQLite database path |
| `XDEBUG` | unset | Set to any value to enable Xdebug |
