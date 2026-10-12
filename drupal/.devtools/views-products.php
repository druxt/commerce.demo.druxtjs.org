<?php

/**
 * @file
 * Builds the `products` View the storefront's /shop page reads through
 * jsonapi_views: a brand filter, exposed sorts and a collection argument.
 *
 * Run once against a local install with `drush php:script`, then export it
 * with `drush config:get views.view.products` into .devtools/config/, which
 * provision imports. The script is the record of how the view was made.
 */

use Drupal\views\Entity\View;

if ($existing = View::load('products')) {
  $existing->delete();
}

$default = [
  'display_plugin' => 'default',
  'id' => 'default',
  'display_title' => 'Default',
  'position' => 0,
  'display_options' => [
    'title' => 'Shop',
    'fields' => [
      'title' => [
        'id' => 'title',
        'table' => 'commerce_product_field_data',
        'field' => 'title',
        'plugin_id' => 'field',
        'entity_type' => 'commerce_product',
        'entity_field' => 'title',
      ],
    ],
    'filters' => [
      'status' => [
        'id' => 'status',
        'table' => 'commerce_product_field_data',
        'field' => 'status',
        'value' => '1',
        'plugin_id' => 'boolean',
        'entity_type' => 'commerce_product',
        'entity_field' => 'status',
      ],
      'product_brand_target_id' => [
        'id' => 'product_brand_target_id',
        'table' => 'commerce_product__product_brand',
        'field' => 'product_brand_target_id',
        'plugin_id' => 'taxonomy_index_tid',
        'operator' => 'or',
        'value' => [],
        'vid' => 'product_brands',
        'type' => 'select',
        'hierarchy' => FALSE,
        'limit' => TRUE,
        'error_message' => TRUE,
        'exposed' => TRUE,
        'expose' => [
          'operator_id' => 'brand_op',
          'label' => 'Brand',
          'identifier' => 'brand',
          'operator' => 'brand_op',
          'multiple' => TRUE,
          'remember' => FALSE,
          'required' => FALSE,
          'operator_limit_selection' => FALSE,
          'operator_list' => [],
          'remember_roles' => ['authenticated' => 'authenticated'],
          'reduce' => FALSE,
        ],
        'is_grouped' => FALSE,
        'group_info' => [],
      ],
    ],
    'sorts' => [
      'title' => [
        'id' => 'title',
        'table' => 'commerce_product_field_data',
        'field' => 'title',
        'order' => 'ASC',
        'plugin_id' => 'standard',
        'entity_type' => 'commerce_product',
        'entity_field' => 'title',
        'exposed' => TRUE,
        'expose' => ['label' => 'Title', 'field_identifier' => 'title'],
      ],
      'created' => [
        'id' => 'created',
        'table' => 'commerce_product_field_data',
        'field' => 'created',
        'order' => 'DESC',
        'plugin_id' => 'date',
        'entity_type' => 'commerce_product',
        'entity_field' => 'created',
        'exposed' => TRUE,
        'expose' => ['label' => 'Newest', 'field_identifier' => 'created'],
        'granularity' => 'second',
      ],
    ],
    'arguments' => [
      'product_collections_target_id' => [
        'id' => 'product_collections_target_id',
        'table' => 'commerce_product__product_collections',
        'field' => 'product_collections_target_id',
        'plugin_id' => 'numeric',
        'default_action' => 'ignore',
        'exception' => ['value' => 'all', 'title_enable' => FALSE, 'title' => 'All'],
        'break_phrase' => TRUE,
        'not' => FALSE,
      ],
    ],
    'pager' => [
      'type' => 'full',
      'options' => [
        'items_per_page' => 12,
        'offset' => 0,
        'id' => 0,
        'total_pages' => NULL,
        'quantity' => 9,
        'expose' => ['items_per_page' => FALSE],
        // The link texts the full pager renders; druxt-views reads them.
        'tags' => ['first' => 'First', 'previous' => 'Previous', 'next' => 'Next', 'last' => 'Last'],
      ],
    ],
    'exposed_form' => [
      'type' => 'basic',
      'options' => ['expose_sort_order' => TRUE, 'sort_asc_label' => 'Asc', 'sort_desc_label' => 'Desc'],
    ],
    'access' => ['type' => 'perm', 'options' => ['perm' => 'view commerce_product']],
    'cache' => ['type' => 'tag', 'options' => []],
    // Distinct, or a product in two collections counts twice when the
    // argument names both.
    'query' => ['type' => 'views_query', 'options' => ['distinct' => TRUE]],
    'style' => ['type' => 'default'],
    'row' => ['type' => 'fields'],
  ],
];

$page = [
  'display_plugin' => 'page',
  'id' => 'page_1',
  'display_title' => 'Shop',
  'position' => 1,
  'display_options' => ['path' => 'shop', 'display_extenders' => []],
];

View::create([
  'id' => 'products',
  'label' => 'Products',
  'module' => 'views',
  'description' => 'The storefront shop page, read through jsonapi_views.',
  'base_table' => 'commerce_product_field_data',
  'base_field' => 'product_id',
  'status' => TRUE,
  'display' => ['default' => $default, 'page_1' => $page],
])->save();
print "views.view.products created\n";
