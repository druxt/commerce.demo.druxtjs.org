<?php

declare(strict_types=1);

namespace Drupal\commerce_demo_live\EventSubscriber;

use Drupal\jsonapi\ResourceType\ResourceTypeBuildEvent;
use Drupal\jsonapi\ResourceType\ResourceTypeBuildEvents;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/**
 * Keeps the order's and the shipment's internal ids public.
 *
 * Drupal's cache tags name an order by its internal id, and the live hub
 * learns of a change from those tags. commerce_api disables every
 * `drupal_internal__` field; renaming this one first leaves it standing.
 */
final class OrderIdSubscriber implements EventSubscriberInterface {

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    // Before commerce_api's own subscriber, which runs at 0.
    return [ResourceTypeBuildEvents::BUILD => ['onResourceTypeBuild', 10]];
  }

  /**
   * Renames the order's internal id so it survives commerce_api's pass.
   */
  public function onResourceTypeBuild(ResourceTypeBuildEvent $event): void {
    // Orders and shipments: the ids their cache tags name.
    $kept = [
      'commerce_order--' => ['drupal_internal__order_id' => 'order_id'],
      'commerce_shipment--' => ['drupal_internal__shipment_id' => 'shipment_id'],
    ];
    foreach ($kept as $prefix => $renames) {
      if (!str_starts_with($event->getResourceTypeName(), $prefix)) {
        continue;
      }
      foreach ($event->getFields() as $field) {
        if (isset($renames[$field->getPublicName()])) {
          $event->setPublicFieldName($field, $renames[$field->getPublicName()]);
        }
      }
    }
  }

}
