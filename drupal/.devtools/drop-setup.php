<?php

/**
 * @file
 * The drop: one product held back and scheduled to publish a few minutes
 * from now, so the catalogue can be seen gaining a product with no reload.
 * Run by provision and by the daily reset, so the drop happens every day.
 */

declare(strict_types=1);

$minutes = (int) (getenv('DROP_MINUTES') ?: 10);
$products = \Drupal::entityTypeManager()->getStorage('commerce_product');
$drop = $products->loadByProperties(['title' => '36" Classic Beach Ball']);
$drop = $drop ? reset($drop) : NULL;
if (!$drop) {
  print "no product to drop\n";
  return;
}
$drop->setUnpublished();
$drop->set('publish_on', time() + $minutes * 60);
$drop->set('unpublish_on', NULL);
$drop->save();
print "drop scheduled: {$drop->label()} publishes in {$minutes} minutes\n";
