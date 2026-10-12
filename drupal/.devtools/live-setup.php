<?php

/**
 * @file
 * The live layer's Drupal side: Simple OAuth for the operator console and the
 * hub, the operator and hub accounts, the demo session message, the order's
 * session field, and Purge pointed at the hub.
 *
 * Idempotent: provision runs it on every install, and running it again on a
 * provisioned site changes nothing. Secrets come from the environment.
 */

use Drupal\consumers\Entity\Consumer;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\message\Entity\MessageTemplate;
use Drupal\simple_oauth\Entity\Oauth2Scope;
use Drupal\user\Entity\Role;
use Drupal\user\Entity\User;

// A hosted environment must not fall back to the local-only secrets below,
// which anyone can read in this repository.
if (getenv('LAGOON')) {
  $missing = array_filter(['OPERATOR_PASSWORD', 'DRUXT_HUB_SECRET', 'DRUXT_SOCKETS_SECRET'], fn ($name) => !getenv($name));
  if ($missing) {
    throw new \RuntimeException(sprintf('Set %s on this environment. The local-only defaults are public.', implode(' and ', $missing)));
  }
}

$config = \Drupal::configFactory();
$entities = \Drupal::entityTypeManager();
$entities->clearCachedDefinitions();

/** Grants the permissions a role may have; names Drupal does not know are skipped and said. */
$grant = function (string $role, array $permissions): void {
  $known = array_keys(\Drupal::service('user.permissions')->getPermissions());
  $unknown = array_diff($permissions, $known);
  if ($unknown) {
    print "  skipped unknown permissions for $role: " . implode(', ', $unknown) . "\n";
  }
  user_role_grant_permissions($role, array_values(array_intersect($permissions, $known)));
};

// Keys sit beside the web root; `simple-oauth:generate-keys` made them.
$config->getEditable('simple_oauth.settings')
  ->set('public_key', '../keys/public.key')
  ->set('private_key', '../keys/private.key')
  ->save();

// The roles: an operator reads and moves orders, the hub creates sessions,
// reads orders and marks them with their session.
foreach (['operator' => 'Operator', 'hub' => 'Hub'] as $id => $label) {
  if (!Role::load($id)) {
    Role::create(['id' => $id, 'label' => $label])->save();
  }
}
// The token debug route answers only to a token that holds this, which is
// how the hub and the console tell an operator from any other account.
$grant('operator', ['access commerce_order overview', 'view commerce_order', 'view default commerce_order', 'update default commerce_order', 'administer commerce_order', 'administer commerce_shipment', 'access druxt resources', 'debug simple_oauth tokens']);
// Message has no per-template create permission without message_ui; the
// hub account administers messages and holds nothing else.
$grant('hub', ['administer messages', 'view commerce_order', 'view default commerce_order', 'update default commerce_order', 'administer commerce_shipment', 'access druxt resources', 'debug simple_oauth tokens']);

// One scope per role, so a token says which it is. Simple OAuth 6 refuses
// every grant until a scope exists that the request can resolve.
// A token's permissions are the scope's role's, not the account's, so the
// hub has a scope of its own.
foreach (['authenticated', 'operator', 'hub'] as $role) {
  if (!Oauth2Scope::load($role)) {
    Oauth2Scope::create([
      'id' => $role,
      'name' => $role,
      'description' => "The $role role.",
      'grant_types' => [
        'password' => ['status' => TRUE, 'description' => ''],
        'refresh_token' => ['status' => TRUE, 'description' => ''],
        'client_credentials' => ['status' => TRUE, 'description' => ''],
      ],
      'umbrella' => FALSE,
      'granularity_id' => 'role',
      'granularity_configuration' => ['role' => $role],
    ])->save();
  }
}

// The accounts. The operator's password comes from the environment, with a
// local default that a public environment never uses.
if (!user_load_by_name('operator')) {
  User::create([
    'name' => 'operator',
    'mail' => 'operator@example.com',
    'status' => 1,
    'roles' => ['operator'],
    'pass' => getenv('OPERATOR_PASSWORD') ?: 'operator',
  ])->save();
}
if (!user_load_by_name('hub')) {
  User::create(['name' => 'hub', 'mail' => 'hub@example.com', 'status' => 1, 'roles' => ['hub']])->save();
}

// The consumers. The console signs in as the operator with the password
// grant on a public client; the hub is a confidential client with its own
// account, through client credentials.
$consumers = [
  'commerce_operator' => [
    'label' => 'Operator console',
    'confidential' => FALSE,
    'pkce' => TRUE,
    'grant_types' => ['password', 'refresh_token'],
    'scopes' => [['scope_id' => 'operator']],
  ],
  'commerce_hub' => [
    'label' => 'Live hub',
    'confidential' => TRUE,
    'pkce' => FALSE,
    'grant_types' => ['client_credentials'],
    'scopes' => [['scope_id' => 'hub']],
    'user_id' => user_load_by_name('hub')->id(),
    'secret' => getenv('DRUXT_HUB_SECRET') ?: 'hub-secret-for-local-only',
  ],
];
foreach ($consumers as $client_id => $values) {
  $existing = $entities->getStorage('consumer')->loadByProperties(['client_id' => $client_id]);
  $consumer = $existing ? reset($existing) : Consumer::create(['client_id' => $client_id, 'owner_id' => 1]);
  $consumer
    ->set('label', $values['label'])
    ->set('description', 'The commerce demo: ' . $values['label'] . '.')
    ->set('confidential', $values['confidential'])
    ->set('pkce', $values['pkce'])
    ->set('grant_types', $values['grant_types'])
    ->set('scopes', $values['scopes'])
    ->set('redirect', getenv('OAUTH_CALLBACK') ?: 'http://localhost:3001/callback');
  if (!empty($values['user_id'])) {
    $consumer->set('user_id', $values['user_id']);
  }
  if (!empty($values['secret'])) {
    $consumer->set('secret', $values['secret']);
  }
  $consumer->save();
}

// The demo session as a message: a code and the operator who opened it.
if (!MessageTemplate::load('demo_session')) {
  MessageTemplate::create([
    'template' => 'demo_session',
    'label' => 'Demo session',
    'description' => 'A console opened a demo session; visitors who arrive by its link belong to it.',
    'text' => [['value' => 'Demo session', 'format' => 'plain_text']],
  ])->save();
}
// Assist: a conversation per visitor thread, a chat message per turn. The
// hub writes both; the console reads them signed in; the visitor's panel
// gets its thread from the socket.
foreach ([
  'conversation' => ['Conversation', 'A visitor\'s assist thread: its code, its session and whether a person has it.'],
  'chat' => ['Chat', 'One turn of an assist conversation, by the visitor, the concierge or an operator.'],
] as $template => [$label, $description]) {
  if (!MessageTemplate::load($template)) {
    MessageTemplate::create([
      'template' => $template,
      'label' => $label,
      'description' => $description,
      'text' => [['value' => $label, 'format' => 'plain_text']],
    ])->save();
  }
}
$fields = [
  ['message', 'demo_session', 'field_code', 'string', 'Code', []],
  ['message', 'demo_session', 'field_operator', 'entity_reference', 'Operator', ['target_type' => 'user']],
  ['commerce_order', 'default', 'field_demo_session', 'string', 'Demo session', []],
  ['message', 'conversation', 'field_code', 'string', 'Code', []],
  ['message', 'conversation', 'field_session', 'string', 'Session', []],
  ['message', 'conversation', 'field_state', 'list_string', 'State', ['allowed_values' => ['concierge' => 'Concierge', 'waiting' => 'Waiting', 'with_operator' => 'With an operator', 'closed' => 'Closed']]],
  ['message', 'conversation', 'field_operator', 'entity_reference', 'Operator', ['target_type' => 'user']],
  ['message', 'chat', 'field_conversation', 'entity_reference', 'Conversation', ['target_type' => 'message']],
  ['message', 'chat', 'field_author', 'list_string', 'Author', ['allowed_values' => ['visitor' => 'Visitor', 'concierge' => 'Concierge', 'operator' => 'Operator']]],
  ['message', 'chat', 'field_body', 'string_long', 'Body', []],
  ['message', 'chat', 'field_picks', 'string_long', 'Picks', []],
];
foreach ($fields as [$entity_type, $bundle, $name, $type, $label, $storage_settings]) {
  if (!FieldStorageConfig::loadByName($entity_type, $name)) {
    FieldStorageConfig::create([
      'field_name' => $name,
      'entity_type' => $entity_type,
      'type' => $type,
      'settings' => $storage_settings,
    ])->save();
  }
  if (!FieldConfig::loadByName($entity_type, $bundle, $name)) {
    FieldConfig::create([
      'field_name' => $name,
      'entity_type' => $entity_type,
      'bundle' => $bundle,
      'label' => $label,
    ])->save();
  }
}
// Purge: the HTTP bundled purger posts invalidated tags to the hub, which
// tells every open page and the order rooms what changed.
$hub = getenv('HUB_URL') ?: 'http://app:3000';
$config->getEditable('purge.plugins')
  ->set('purgers', [['order_index' => 1, 'instance_id' => 'druxt_live', 'plugin_id' => 'httpbundled']])
  ->save();
$config->getEditable('purge_purger_http.settings.druxt_live')
  ->set('id', 'druxt_live')
  ->set('name', 'Druxt live')
  ->set('invalidationtype', 'tag')
  ->set('hostname', parse_url($hub, PHP_URL_HOST))
  ->set('port', parse_url($hub, PHP_URL_PORT) ?: (parse_url($hub, PHP_URL_SCHEME) === 'https' ? 443 : 80))
  ->set('path', '/_live/purge')
  ->set('request_method', 'POST')
  ->set('scheme', parse_url($hub, PHP_URL_SCHEME) ?: 'http')
  ->set('verify', TRUE)
  ->set('headers', [
    ['field' => 'X-Druxt-Sockets-Secret', 'value' => getenv('DRUXT_SOCKETS_SECRET') ?: 'live-secret-for-local-only'],
    ['field' => 'Content-Type', 'value' => 'text/plain'],
  ])
  ->set('body', '[invalidations:separated_comma]')
  ->set('body_content_type', 'text/plain')
  ->set('runtime_measurement', TRUE)
  ->set('timeout', 1.0)
  ->set('connect_timeout', 1.0)
  ->set('cooldown_time', 0.0)
  ->set('max_requests', 100)
  ->set('http_errors', FALSE)
  ->save();

// An account with no role, for the console's wrong-role screen. Its password
// comes from the environment too, with the same kind of local default.
if (!user_load_by_name('shopper')) {
  User::create([
    'name' => 'shopper',
    'mail' => 'shopper@example.com',
    'status' => 1,
    'pass' => getenv('SHOPPER_PASSWORD') ?: 'shopper',
  ])->save();
}

// A courier for the demo: free, everywhere, and nothing ships. Kickstart's
// own methods are US only, so a visitor anywhere else had no rate and no
// shipment, and the board had nothing to ship.
$methods = \Drupal::entityTypeManager()->getStorage('commerce_shipping_method');
if (!$methods->loadByProperties(['name' => 'Demo courier'])) {
  $methods->create([
    'name' => 'Demo courier',
    'status' => 1,
    'weight' => -10,
    'stores' => [1],
    'plugin' => [
      'target_plugin_id' => 'flat_rate',
      'target_plugin_configuration' => [
        'rate_label' => 'Demo courier',
        'rate_description' => 'Free delivery, anywhere.',
        'rate_amount' => ['number' => '0', 'currency_code' => 'USD'],
        'services' => ['default'],
        'default_package_type' => 'custom_box',
      ],
    ],
    'conditions' => [],
    'condition_operator' => 'AND',
  ])->save();
}

print "live setup done\n";
