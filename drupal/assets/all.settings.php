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

// Drupal's Preview button opens the storefront's preview page in a frame.
// The path is relative: the edit screens are proxied onto the storefront's
// origin, so the frame and the preview request go with the editor's session.
$settings['consumer_node_preview'] = [
  'targets' => [
    'storefront' => [
      'label' => 'Storefront',
      'url' => '/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]',
      // The Nuxt layouts the preview's Layout select offers, as listed under
      // druxt.nodePreview.layouts. A preview opens on the first.
      'layouts' => ['preview', 'default'],
    ],
  ],
  'default' => 'settings:storefront',
];

