<?php

declare(strict_types=1);

namespace Drupal\consumer_node_preview\Plugin\Field\FieldWidget;

use Drupal\Core\Field\FieldItemListInterface;
use Drupal\Core\Field\WidgetBase;
use Drupal\Core\Form\FormStateInterface;
use Symfony\Component\Validator\ConstraintViolationInterface;

/**
 * Form widget for a preview target.
 *
 * @FieldWidget(
 *   id = "consumer_preview_target_default",
 *   label = @Translation("Preview target"),
 *   field_types = {
 *     "consumer_preview_target",
 *   },
 * )
 */
class PreviewTargetWidget extends WidgetBase {

  /**
   * {@inheritdoc}
   *
   * @param \Drupal\Core\Field\FieldItemListInterface<\Drupal\Core\Field\FieldItemInterface> $items
   *   The field items.
   * @param int $delta
   *   The item delta.
   * @param array $element
   *   The base form element.
   * @param array $form
   *   The full form.
   * @param \Drupal\Core\Form\FormStateInterface $form_state
   *   The form state.
   */
  public function formElement(FieldItemListInterface $items, $delta, array $element, array &$form, FormStateInterface $form_state): array {
    $element['label'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Label'),
      '#default_value' => $items[$delta]->label ?? '',
      '#maxlength' => 255,
    ];
    $element['url'] = [
      '#type' => 'textfield',
      '#title' => $this->t('URL template'),
      '#description' => $this->t('An absolute http or https URL. It can use the tokens [jsonapi_node_preview], [jsonapi_node_preview_path], [uuid] and [view_mode].'),
      '#default_value' => $items[$delta]->url ?? '',
      '#maxlength' => 2048,
    ];
    return $element;
  }

  /**
   * {@inheritdoc}
   *
   * Puts a violation on the label or URL field it is about.
   */
  public function errorElement(array $element, ConstraintViolationInterface $error, array $form, FormStateInterface $form_state): array|bool {
    $property = $error->arrayPropertyPath[0] ?? NULL;
    return is_string($property) && isset($element[$property]) ? $element[$property] : $element;
  }

}
