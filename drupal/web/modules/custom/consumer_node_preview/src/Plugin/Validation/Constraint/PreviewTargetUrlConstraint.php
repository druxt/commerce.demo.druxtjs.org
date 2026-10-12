<?php

declare(strict_types=1);

namespace Drupal\consumer_node_preview\Plugin\Validation\Constraint;

use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Validation\Attribute\Constraint;
use Symfony\Component\Validator\Attribute\HasNamedArguments;
use Symfony\Component\Validator\Constraint as SymfonyConstraint;

/**
 * Checks that a consumer's preview target URL is absolute http or https.
 *
 * The consumer form and the targets endpoint both save through this rule.
 * Relative URLs are for settings.php targets only, because they depend on
 * how each environment serves the frontend.
 */
#[Constraint(
  id: 'ConsumerPreviewTargetUrl',
  label: new TranslatableMarkup('Preview target URL', [], ['context' => 'Validation']),
)]
class PreviewTargetUrlConstraint extends SymfonyConstraint {

  #[HasNamedArguments]
  public function __construct(
    mixed $options = NULL,
    public string $message = 'The URL %url must be absolute and use http or https.',
    ?array $groups = NULL,
    mixed $payload = NULL,
  ) {
    parent::__construct($options, $groups, $payload);
  }

}
