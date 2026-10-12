<?php

/**
 * @file
 * The landing page's "Content" section as a split: Commerce by Centarro on
 * one side, Druxt on the other, each with its logo. Everything is Layout
 * Builder content, so an editor can change either half.
 *
 * Run by provision after the landing page copy. Safe to run again.
 */

use Drupal\block_content\Entity\BlockContent;
use Drupal\file\Entity\File;
use Drupal\layout_builder\SectionComponent;
use Drupal\media\Entity\Media;

$etm = \Drupal::entityTypeManager();

$node = NULL;
foreach ($etm->getStorage('node')->loadByProperties(['type' => 'cklb_landing_page']) as $candidate) {
  $node = $candidate;
  break;
}
if (!$node) {
  echo "no landing page\n";
  return;
}

// The Druxt mark as image media, beside Centarro's logo.
$media = $etm->getStorage('media')->loadByProperties(['bundle' => 'image', 'name' => 'Druxt']);
$media = $media ? reset($media) : NULL;
if (!$media) {
  $directory = 'public://druxt';
  \Drupal::service('file_system')->prepareDirectory($directory, 1);
  $uri = \Drupal::service('file_system')->copy(__DIR__ . '/assets/druxt-mark.png', $directory . '/druxt-mark.png', 1);
  $file = File::create(['uri' => $uri, 'status' => 1, 'uid' => 1]);
  $file->save();
  $media = Media::create([
    'bundle' => 'image',
    'name' => 'Druxt',
    'uid' => 1,
    'field_media_image' => ['target_id' => $file->id(), 'alt' => 'Druxt'],
  ]);
  $media->save();
}

/**
 * A non-reusable block for this page, found again by its description.
 */
$block = function (string $bundle, string $info, array $values) use ($etm) {
  $found = $etm->getStorage('block_content')->loadByProperties(['type' => $bundle, 'info' => $info]);
  $block = $found ? reset($found) : BlockContent::create(['type' => $bundle, 'info' => $info, 'reusable' => FALSE]);
  foreach ($values as $name => $value) {
    $block->set($name, $value);
  }
  $block->save();
  return $block;
};

$text = fn (string $html) => ['value' => $html, 'format' => 'basic_html'];

// The Druxt half reuses Kickstart's own title, text and button blocks.
$druxt = [
  'image' => $block('cklb_image', 'Split: Druxt logo', ['cklb_image' => ['target_id' => $media->id()]]),
  'title' => $etm->getStorage('block_content')->load(3),
  'text' => $etm->getStorage('block_content')->load(10),
  'button' => $etm->getStorage('block_content')->load(4),
];
$druxt['title']->set('cklb_title', 'Decoupled, by Druxt')->save();
$druxt['text']->set('cklb_text', $text('<p>Druxt turns Drupal entities, views and layouts into Vue components. This whole store is Drupal, rendered by Nuxt.</p>'))->save();
$druxt['button']->set('cklb_cta', ['uri' => 'https://druxtjs.org', 'title' => 'Explore Druxt', 'options' => []])->save();

$centarro = [
  'image' => $etm->getStorage('block_content')->load(6),
  'title' => $block('cklb_title', 'Split: Centarro title', ['cklb_title' => 'Commerce, by Centarro']),
  'text' => $block('cklb_text', 'Split: Centarro text', ['cklb_text' => $text('<p>Drupal Commerce and Commerce Kickstart come from Centarro. Every product, price and order here runs on them.</p>')]),
  'button' => $block('cklb_button', 'Split: Centarro button', ['cklb_cta' => ['uri' => 'https://www.centarro.io/', 'title' => 'Meet Centarro', 'options' => []]]),
];

$components = [];
foreach (['blb_region_col_1' => $centarro, 'blb_region_col_2' => $druxt] as $region => $half) {
  $weight = 0;
  foreach ($half as $entity) {
    $component = new SectionComponent(\Drupal::service('uuid')->generate(), $region, [
      'id' => 'inline_block:' . $entity->bundle(),
      'label' => $entity->label(),
      'label_display' => FALSE,
      'provider' => 'layout_builder',
      'view_mode' => 'full',
      'block_id' => $entity->id(),
      'block_revision_id' => $entity->getRevisionId(),
      'block_serialized' => NULL,
      'context_mapping' => [],
    ]);
    $component->setWeight($weight++);
    $components[] = $component;
  }
}

$usage = \Drupal::service('inline_block.usage');
foreach ($node->get('layout_builder__layout')->getSections() as $section) {
  $settings = $section->getLayoutSettings();
  $label = $settings['label'] ?? '';
  if ($label === 'Testimonial') {
    $settings['section_classes'] = 'quote-band';
    $section->setLayoutSettings($settings);
  }
  if ($label !== 'Content') {
    continue;
  }
  $settings['layout_regions_classes'] = [
    'blb_region_col_1' => ['col-lg-6', 'col-md-6', 'col-12'],
    'blb_region_col_2' => ['col-lg-6', 'col-md-6', 'col-12'],
  ];
  $settings['section_classes'] = 'brand-split';
  $section->setLayoutSettings($settings);
  foreach (array_keys($section->getComponents()) as $uuid) {
    $section->removeComponent($uuid);
  }
  foreach ($components as $component) {
    $section->appendComponent($component);
    $usage->addUsage((int) $component->get('configuration')['block_id'], $node);
  }
}
$node->save();
echo "split set\n";
