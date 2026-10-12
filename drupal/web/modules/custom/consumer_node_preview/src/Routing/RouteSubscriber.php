<?php

declare(strict_types=1);

namespace Drupal\consumer_node_preview\Routing;

use Drupal\consumer_node_preview\Controller\NodePreviewController;
use Drupal\Core\Routing\RouteSubscriberBase;
use Drupal\Core\Routing\RoutingEvents;
use Symfony\Component\Routing\RouteCollection;

/**
 * Points the node preview route at this module's controller.
 *
 * The preview also becomes a node operation, like edit, so the node module's
 * "Use the administration theme when editing or creating content" setting
 * decides its theme. A frontend preview then sits in the admin theme, beside
 * the toolbar, not in the site's front-end theme.
 */
class RouteSubscriber extends RouteSubscriberBase {

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    // Ahead of core's NodeAdminRouteSubscriber, which reads the option at 0.
    return [RoutingEvents::ALTER => ['onAlterRoutes', 10]];
  }

  /**
   * {@inheritdoc}
   */
  protected function alterRoutes(RouteCollection $collection): void {
    if ($route = $collection->get('entity.node.preview')) {
      $route->setOption('_node_operation_route', TRUE);
      $route->setDefault('_controller', NodePreviewController::class . '::view');
    }
  }

}
