<?php

/**
 * @file
 * Router for PHP's built-in development server.
 *
 * Wraps Drupal core's own `.ht.router.php` to fix one thing it gets wrong for
 * this site: core does
 *
 *   $url = parse_url($_SERVER['REQUEST_URI']);
 *   if (file_exists(__DIR__ . $url['path'])) { return FALSE; }
 *
 * `parse_url()` returns the path still percent-encoded, so a request for
 * `/sites/default/files/2022-03/%28Chloe%29%20Eau%20De%20Parfum.jpg` is
 * checked against a filename containing a literal `%28`, which does not
 * exist. The file is there; the check looks in the wrong place. Every Commerce
 * Kickstart demo image is named with spaces and parentheses, so the whole
 * catalogue renders without imagery on a local dev server while working
 * perfectly behind nginx.
 *
 * This decodes the path first, serves the file when it really is there, and
 * otherwise hands over to core's router unchanged.
 *
 * Core's file is scaffolded by composer, so it is not edited: this sits beside
 * it and is passed to `php -S` instead.
 */

declare(strict_types=1);

// Drupal stores extension namespaces as paths relative to the app root and
// never chdirs. Real web servers set the working directory to the docroot;
// `php -S -t web` keeps whatever directory it was launched from, so plugin and
// entity discovery silently finds nothing unless this is set.
chdir(__DIR__ . '/../web');

if (PHP_SAPI !== 'cli-server') {
  header($_SERVER['SERVER_PROTOCOL'] . ' 403 Forbidden');
  exit;
}

$docroot = __DIR__ . '/../web';
$path = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$decoded = rawurldecode($path);

// Only serve a real file, and only from inside the docroot. realpath() also
// resolves any `..` a request might carry, so a traversal cannot escape.
$candidate = realpath($docroot . $decoded);
$root = realpath($docroot);
if (
  $candidate !== FALSE
  && $root !== FALSE
  && str_starts_with($candidate, $root . DIRECTORY_SEPARATOR)
  && is_file($candidate)
  && !str_ends_with($candidate, '.php')
) {
  // Returning FALSE tells the built-in server to serve the file itself,
  // including its content type and range handling.
  return FALSE;
}

// Everything else is Drupal's, handled by core's own router.
//
// The return value has to be passed on. Core's router answers `return FALSE`
// for any path that exists on disk, which includes `/` because the docroot is
// a directory, and that is how it tells the built-in server to serve the
// directory index itself. `return` inside a required file returns from that
// file, not from this one, so without capturing it this router fell through to
// its own end and answered every such request with 200 and an empty body. The
// front page was blank while every other route worked.
return require $docroot . '/.ht.router.php';
