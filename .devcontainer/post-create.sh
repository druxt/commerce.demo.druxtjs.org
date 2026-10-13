#!/usr/bin/env bash
#
# Dev container setup. The official PHP feature (ghcr.io/devcontainers/
# features/php) builds PHP from source with no "extensions" option -
# gd and bcmath aren't compiled in at all. Drupal core (gd) and
# drupal/commerce (bcmath) need them regardless of what any composer.json
# platform override was told (their installers do independent runtime
# checks). No sodium needed here - unlike quickstart/quickstart-druxt-
# site-tome, this repo has no simple_oauth/consumers (and so no
# lcobucci/jwt) at all.
set -euo pipefail

echo "==> Installing system dependencies"
sudo apt-get update
# python3-setuptools: trixie ships Python 3.13, which dropped the
# distutils stdlib module entirely - old node-gyp (bundled with this
# repo's pinned Node 16's npm) still imports it, and setuptools ships a
# compatible shim. Same fix this project's own CI pipeline already
# needed for the same reason.
sudo apt-get install -y python3 python3-setuptools build-essential libjpeg-dev libpng-dev libwebp-dev libfreetype-dev zlib1g-dev

CONF_DIR=$(php --ini | grep 'Scan for additional .ini files' | sed 's/.*: *//')
# The PHP feature ships Xdebug globally active - every php/composer run
# stalls trying to reach a debug client and logs a warning. Off by
# default; `npm run xdebug` re-enables it per-process with -d flags.
echo 'xdebug.mode=off' | sudo tee "$CONF_DIR/zz-xdebug-off.ini" > /dev/null


# Neither gd nor bcmath is a real standalone PECL package for current PHP
# versions - both are bundled core extensions that only get built via a
# configure flag during PHP's own compile (`--with-jpeg` etc. for gd,
# `--enable-bcmath` for bcmath). `pecl install` fails with "No releases
# available" for both, even with a fully up-to-date channel, because
# there is nothing there to install. Build both directly from PHP's own
# source tree instead - the same technique the PHP feature itself uses
# as its xdebug fallback.
PHP_FULL_VERSION=$(php -r 'echo PHP_VERSION;')
# mktemp, not a fixed /tmp path: predictable names are open to symlink
# swaps by any local process between download and extract.
PHP_SRC_TMP="$(mktemp -d)"
trap 'rm -rf "$PHP_SRC_TMP"' EXIT
curl -fsSL "https://www.php.net/distributions/php-${PHP_FULL_VERSION}.tar.gz" -o "$PHP_SRC_TMP/php-src.tar.gz"

echo "==> Building gd (not compiled in by the PHP feature at all)"
GD_BUILD_DIR="$PHP_SRC_TMP/gd"
mkdir -p "$GD_BUILD_DIR"
tar -xzf "$PHP_SRC_TMP/php-src.tar.gz" -C "$GD_BUILD_DIR" --strip-components=3 "php-${PHP_FULL_VERSION}/ext/gd"
(
  cd "$GD_BUILD_DIR"
  phpize
  ./configure --with-jpeg --with-webp --with-freetype
  make -j"$(nproc)"
  make install
)
echo 'extension=gd' | sudo tee "$CONF_DIR/gd.ini" > /dev/null

echo "==> Building bcmath (not compiled in by the PHP feature; drupal/commerce requires it)"
BCMATH_BUILD_DIR="$PHP_SRC_TMP/bcmath"
mkdir -p "$BCMATH_BUILD_DIR"
tar -xzf "$PHP_SRC_TMP/php-src.tar.gz" -C "$BCMATH_BUILD_DIR" --strip-components=3 "php-${PHP_FULL_VERSION}/ext/bcmath"
(
  cd "$BCMATH_BUILD_DIR"
  phpize
  ./configure --enable-bcmath
  make -j"$(nproc)"
  make install
)
echo 'extension=bcmath' | sudo tee "$CONF_DIR/bcmath.ini" > /dev/null


# Fail fast if the gd build above didn't actually take - composer and
# Drupal's installer both hard-require it, and a broken build surfacing
# here beats a confusing failure mid-provision.
php -r "exit(extension_loaded('gd') ? 0 : 1);" || { echo "gd extension failed to load" >&2; exit 1; }


echo "==> Trusting this repo's mise.toml"
mise trust

echo "==> Running npm install (triggers the full setup pipeline)"
# --loglevel=error: the root devDependencies are lint tooling that
# requires Node 22 (CI runs them there); installing them under the
# app's pinned Node 16 works fine but emits a wall of EBADENGINE
# warnings that drowns the real setup output on first run.
npm install --loglevel=error
