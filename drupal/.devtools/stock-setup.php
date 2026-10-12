<?php

/**
 * @file
 * Commerce Stock for the demo: local stock in one location, a stock level
 * field on the physical variation types, and a count per variation that a
 * sale moves. Run by provision after the catalogue exists.
 */

declare(strict_types=1);

use Drupal\commerce_stock\StockTransactionsInterface;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;

$entity_type_manager = \Drupal::entityTypeManager();
$config = \Drupal::configFactory();

// Local stock is the service for every variation type.
$manager = $config->getEditable('commerce_stock.service_manager');
$manager->set('default_service_id', 'local_stock');
foreach (['physical', 'media_physical', 'default', 'media_license_download'] as $bundle) {
  $manager->set("commerce_product_variation_{$bundle}_service_id", $bundle === 'media_license_download' ? 'always_in_stock' : 'local_stock');
}
// A sale moves the stock when the order is placed; a cancel puts it back.
$manager->set('stock_events_plugin_id', 'core_stock_events');
$manager->save();
$config->getEditable('commerce_stock.core_stock_events')
  ->set('core_stock_events_order_complete_event_type', 'placed')
  ->set('core_stock_events_order_cancel', TRUE)
  ->set('core_stock_events_order_updates', TRUE)
  ->save();

// One warehouse.
$locations = $entity_type_manager->getStorage('commerce_stock_location');
$location = $locations->loadByProperties(['name' => 'Warehouse']);
$location = $location ? reset($location) : NULL;
if (!$location) {
  $location = $locations->create(['type' => 'default', 'name' => 'Warehouse', 'status' => 1]);
  $location->save();
}

// The stock level field, so the level reads over JSON:API.
if (!FieldStorageConfig::loadByName('commerce_product_variation', 'field_stock_level')) {
  FieldStorageConfig::create([
    'field_name' => 'field_stock_level',
    'entity_type' => 'commerce_product_variation',
    'type' => 'commerce_stock_level',
    'cardinality' => 1,
  ])->save();
}
foreach (['physical', 'media_physical'] as $bundle) {
  if (!FieldConfig::loadByName('commerce_product_variation', $bundle, 'field_stock_level')) {
    FieldConfig::create([
      'field_name' => 'field_stock_level',
      'entity_type' => 'commerce_product_variation',
      'bundle' => $bundle,
      'label' => 'Stock level',
    ])->save();
  }
}

// A count per variation, once: a few of most things, one or two of the
// dearest, so a sale can show the last one go.
$variations = $entity_type_manager->getStorage('commerce_product_variation')->loadByProperties(['type' => ['physical', 'media_physical']]);
$service = \Drupal::service('commerce_stock.service_manager')->getService(reset($variations));
$checker = $service->getStockChecker();
$updater = $service->getStockUpdater();
$seeded = 0;
foreach ($variations as $variation) {
  $level = $checker->getTotalStockLevel($variation, [$location]);
  if ($level > 0) {
    continue;
  }
  $price = (float) ($variation->getPrice() ? $variation->getPrice()->getNumber() : 0);
  $count = $price >= 150 ? 2 : ($price >= 50 ? 6 : 14);
  $updater->createTransaction($variation, (int) $location->id(), '', $count, 0, 'USD', StockTransactionsInterface::NEW_STOCK, ['message' => 'Opening stock for the demo.']);
  $seeded++;
}
print "stock setup done, {$seeded} variations seeded\n";
