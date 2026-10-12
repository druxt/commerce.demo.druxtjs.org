<?php

declare(strict_types=1);

namespace Drupal\consumer_node_preview;

use Drupal\consumers\Entity\ConsumerInterface;
use Drupal\node\NodeInterface;

/**
 * Reads preview targets and resolves their URL tokens.
 *
 * A target comes from one of two places. A consumer lists targets in its
 * preview_targets field, keyed "<consumer id>:<delta>". The site lists
 * targets in settings.php, keyed "settings:<name>", which suits a URL that
 * differs per environment.
 */
interface PreviewTargetsProviderInterface {

  /**
   * The pattern a layout name matches: letters, numbers, - and _.
   */
  public const LAYOUT_PATTERN = '/^[A-Za-z0-9_-]+$/';

  /**
   * Returns the preview targets of one consumer.
   *
   * @param \Drupal\consumers\Entity\ConsumerInterface $consumer
   *   The consumer.
   *
   * @return array<int, array{label: string, url: string}>
   *   The targets, in field order.
   */
  public function getTargets(ConsumerInterface $consumer): array;

  /**
   * Returns the layouts one consumer's frontend can render a preview in.
   *
   * @param \Drupal\consumers\Entity\ConsumerInterface $consumer
   *   The consumer.
   *
   * @return list<string>
   *   The layout names, in field order.
   */
  public function getLayouts(ConsumerInterface $consumer): array;

  /**
   * Returns every target: the site's first, then each published consumer's.
   *
   * @return array<string, array{label: string, url: string, layouts: list<string>}>
   *   The targets, keyed "settings:<name>" or "<consumer id>:<delta>". A
   *   consumer target's label starts with the consumer's label, and its
   *   layouts are the consumer's. A site target lists its own layouts.
   */
  public function getAllTargets(): array;

  /**
   * Returns select options for every target.
   *
   * @return array<string, string>
   *   The target labels, keyed as getAllTargets() keys them.
   */
  public function getTargetOptions(): array;

  /**
   * Returns the target for one key.
   *
   * @param string $key
   *   A key in the form "settings:<name>" or "<consumer id>:<delta>".
   *
   * @return array{label: string, url: string, layouts: list<string>}|null
   *   The target, or NULL when the key does not resolve.
   */
  public function getTargetByKey(string $key): ?array;

  /**
   * Returns the key of the target the preview opens on.
   *
   * @return string|null
   *   The default from settings, else the first target, or NULL when there
   *   are no targets.
   */
  public function getDefaultKey(): ?string;

  /**
   * Returns the JSON:API preview document's URL for a node.
   *
   * The URL includes the node's entity_reference_revisions fields, such as
   * paragraphs, so a frontend gets their unsaved values in one request.
   *
   * @param \Drupal\node\NodeInterface $node_preview
   *   The node in the preview temp store.
   * @param bool $absolute
   *   TRUE for an absolute URL, FALSE for a path from the site root.
   *
   * @return string|null
   *   The URL, or NULL when JSON:API has no preview for the node's bundle.
   */
  public function getEndpoint(NodeInterface $node_preview, bool $absolute = TRUE): ?string;

  /**
   * Resolves the tokens in a target URL for one previewed node.
   *
   * @param string $url
   *   The URL template.
   * @param \Drupal\node\NodeInterface $node_preview
   *   The node in the preview temp store.
   * @param string $view_mode_id
   *   The view mode.
   * @param string $layout
   *   The layout, or an empty string for none.
   *
   * @return string
   *   The URL with [jsonapi_node_preview], [jsonapi_node_preview_path],
   *   [uuid], [view_mode] and [layout] replaced.
   */
  public function resolveUrl(string $url, NodeInterface $node_preview, string $view_mode_id, string $layout = ''): string;

}
