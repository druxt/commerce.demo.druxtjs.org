<?php

declare(strict_types=1);

namespace Drupal\commerce_demo_live\Field;

use Drupal\Core\Field\FieldItemList;
use Drupal\Core\TypedData\ComputedItemListTrait;

/**
 * A variation's available stock, asked of the stock service when read.
 */
final class StockItemList extends FieldItemList {

  use ComputedItemListTrait;

  /**
   * {@inheritdoc}
   */
  protected function computeValue(): void {
    $variation = $this->getEntity();
    $level = NULL;
    if (!$variation->isNew() && \Drupal::hasService('commerce_stock.service_manager')) {
      try {
        $manager = \Drupal::service('commerce_stock.service_manager');
        $service = $manager->getService($variation);
        $context = $manager->getContext($variation);
        $locations = $service->getConfiguration()->getAvailabilityLocations($context, $variation);
        $level = (int) $service->getStockChecker()->getTotalStockLevel($variation, $locations);
      }
      catch (\Throwable $e) {
        $level = NULL;
      }
    }
    $this->list[0] = $this->createItem(0, $level);
  }

}
