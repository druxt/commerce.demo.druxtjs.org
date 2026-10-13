<?php

/**
 * @file
 * Settings for every environment, scaffolded to sites/default.
 *
 * amazee.io's settings.php includes this file on Lagoon and locally alike.
 * Lagoon's database, hash salt and reverse proxy come from its own
 * settings.lagoon.php. A local run's come from settings.local.php, which
 * .devtools/provision writes.
 */

$settings['config_sync_directory'] = '../config/sync';

if (getenv('LAGOON_ENVIRONMENT_TYPE') !== 'production') {
  // A checkout updates settings files in place, so their directory stays
  // writable outside production.
  $settings['skip_permissions_hardening'] = TRUE;
}

// While .devtools/provision or the daily reset runs, web requests stop here,
// before Drupal loads a container or writes a cache from a half-built site.
if (PHP_SAPI !== 'cli' && file_exists(__DIR__ . '/files/.provisioning')) {
  http_response_code(503);
  header('Retry-After: 30');
  exit;
}

// The reset snapshot and uploads that must not be served are kept here.
// Lagoon keeps this directory on the shared files volume.
$settings['file_private_path'] = __DIR__ . '/files/private';

$settings['maintenance_theme'] = 'centarro_claro';
