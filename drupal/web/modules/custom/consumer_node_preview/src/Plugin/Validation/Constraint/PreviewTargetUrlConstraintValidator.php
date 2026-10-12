<?php

declare(strict_types=1);

namespace Drupal\consumer_node_preview\Plugin\Validation\Constraint;

use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;

/**
 * Validates the ConsumerPreviewTargetUrl constraint.
 */
class PreviewTargetUrlConstraintValidator extends ConstraintValidator {

  /**
   * {@inheritdoc}
   */
  public function validate(mixed $value, Constraint $constraint): void {
    assert($constraint instanceof PreviewTargetUrlConstraint);
    // An empty URL is the NotBlank constraint's job.
    if (!is_string($value) || trim($value) === '') {
      return;
    }
    $parts = parse_url(trim($value));
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    if (!is_array($parts) || empty($parts['host']) || !in_array($scheme, ['http', 'https'], TRUE)) {
      $this->context->addViolation($constraint->message, ['%url' => $value]);
    }
  }

}
