<?php

declare(strict_types=1);

namespace Drupal\Tests\consumer_node_preview\Kernel;

use Drupal\consumer_node_preview\Controller\NodePreviewController;
use Drupal\consumers\Entity\Consumer;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\KernelTests\KernelTestBase;
use Drupal\Core\Routing\RouteObjectInterface;
use Drupal\node\Controller\NodePreviewController as CoreNodePreviewController;
use Drupal\node\Form\NodePreviewForm;
use Drupal\node\Entity\Node;
use Drupal\node\Entity\NodeType;
use Drupal\node\NodeInterface;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;
use Symfony\Component\HttpFoundation\ParameterBag;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Session\Session;
use Symfony\Component\HttpFoundation\Session\Storage\MockArraySessionStorage;

/**
 * Tests the tabbed preview built around core's node preview.
 *
 * @group consumer_node_preview
 */
#[Group('consumer_node_preview')]
#[RunTestsInSeparateProcesses]
class NodePreviewControllerTest extends KernelTestBase {

  /**
   * {@inheritdoc}
   */
  protected static $modules = [
    'system',
    'user',
    'field',
    'file',
    'image',
    'filter',
    'text',
    'node',
    'path_alias',
    'serialization',
    'entity_reference_revisions',
    'jsonapi',
    'jsonapi_node_preview',
    'consumers',
    'consumer_node_preview',
  ];

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    $this->installEntitySchema('user');
    $this->installEntitySchema('node');
    $this->installEntitySchema('path_alias');
    $this->installEntitySchema('consumer');
    $this->installConfig(['system', 'node', 'filter']);
    NodeType::create(['type' => 'page', 'name' => 'Page', 'display_submitted' => FALSE])->save();
    $this->container->get('router.builder')->rebuild();
  }

  /**
   * Tests that the preview route is a node operation on this controller.
   */
  public function testThePreviewRouteIsNodeOperation(): void {
    $route = $this->container->get('router.route_provider')->getRouteByName('entity.node.preview');
    $this->assertSame(NodePreviewController::class . '::view', $route->getDefault('_controller'));
    $this->assertTrue($route->getOption('_node_operation_route'));
  }

  /**
   * Tests that core's preview bar stays where the page renderer reads it.
   *
   * Drupal 11 core attaches the bar to the controller's page_top, and the
   * page renderer reads it from the top of the main content. Drupal 10 core
   * adds it in hook_page_top() instead, and rejects page_top in #attached.
   * So the preview keeps exactly what core attached, and adds no page_top
   * key of its own.
   */
  public function testCoresPreviewBarStaysAtTheTopOfThePage(): void {
    $node = $this->node();
    $core = CoreNodePreviewController::create($this->container)->view($node, 'full');
    $this->assertSame(
      array_keys($core['#attached']['page_top'] ?? []),
      array_keys($this->preview($node)['#attached']['page_top'] ?? []),
    );
    $this->assertSame(
      isset($core['#attached']['page_top']),
      array_key_exists('page_top', $this->preview($node)['#attached']),
    );
  }

  /**
   * Tests that the View mode select sits with the tabs.
   *
   * It is core's own form, minus its link back to the edit form, which stays
   * in core's bar, and minus the auto-submit, so a change of view mode does
   * not reload the page.
   */
  public function testTheViewModeSelectSitsWithTheTabs(): void {
    $html = $this->html();
    $this->assertSame(1, preg_match('#<select[^>]*name="view_mode"[^>]*>#', $html, $select));
    $this->assertStringContainsString('data-consumer-node-preview-view-mode', $select[0]);
    $this->assertStringNotContainsString('data-drupal-autosubmit', $select[0]);
    $this->assertStringNotContainsString('node-preview-backlink', $html);
  }

  /**
   * Tests that core's bar keeps only its back link on the preview page.
   */
  public function testCoresBarKeepsOnlyItsBackLink(): void {
    $this->pushRoute('entity.node.preview', ['node_preview' => 'x', 'view_mode_id' => 'full']);
    $variables = ['page_top' => $this->coresBar()];
    consumer_node_preview_preprocess_html($variables);

    $html = (string) $this->render($variables['page_top']);
    $this->assertStringContainsString('node-preview-backlink', $html);
    $this->assertStringNotContainsString('name="view_mode"', $html);
    $this->assertStringNotContainsString('value="Switch"', $html);
  }

  /**
   * Tests that core's bar is left whole on any other page.
   */
  public function testCoresBarIsWholeElsewhere(): void {
    $this->pushRoute('entity.node.canonical', ['node' => '1']);
    $variables = ['page_top' => $this->coresBar()];
    consumer_node_preview_preprocess_html($variables);

    $this->assertStringContainsString('name="view_mode"', (string) $this->render($variables['page_top']));
  }

  /**
   * Tests that the target URLs reach JavaScript with the view mode open.
   *
   * The page then switches view mode, and target, without a reload.
   */
  public function testTargetUrlsReachJavaScript(): void {
    $this->setSetting('consumer_node_preview', [
      'targets' => ['local' => ['label' => 'Local', 'url' => 'http://localhost:3000/[view_mode]/[uuid]']],
    ]);
    $node = $this->node();
    $settings = $this->preview($node)['#attached']['drupalSettings']['consumerNodePreview'];
    $placeholder = NodePreviewController::VIEW_MODE_PLACEHOLDER;

    $this->assertSame('settings:local', $settings['active']);
    $this->assertSame('full', $settings['viewMode']);
    $this->assertSame('Local', $settings['targets']['settings:local']['label']);
    $this->assertSame('http://localhost:3000/' . $placeholder . '/' . $node->uuid(), $settings['targets']['settings:local']['url']);
    $this->assertStringEndsWith('/node/preview/' . $node->uuid() . '/' . $placeholder, $settings['previewUrl']);
    $this->assertStringEndsWith('/node/preview/' . $node->uuid() . '/' . $placeholder . '/drupal', $settings['drupalUrl']);
  }

  /**
   * Tests that the Drupal tab gets another view mode over AJAX.
   */
  public function testTheDrupalTabReloadsOverAjax(): void {
    $route = $this->container->get('router.route_provider')->getRouteByName('consumer_node_preview.drupal');
    $this->assertSame('{node_preview}', $route->getRequirement('_node_preview_access'));
    $this->assertSame('node_preview', $route->getOption('parameters')['node_preview']['type']);

    $response = NodePreviewController::create($this->container)->drupal($this->node(), 'teaser');
    $command = $response->getCommands()[0];
    $this->assertSame('[data-consumer-node-preview-drupal]', $command['selector']);
    $this->assertStringContainsString('Unsaved', (string) $command['data']);
  }

  /**
   * Tests that the page has the three tabs.
   */
  public function testThePageHasThreeTabs(): void {
    $html = $this->html();
    $this->assertSame(3, substr_count($html, 'role="tab"'));
    foreach (['frontend', 'drupal', 'jsonapi'] as $tab) {
      $this->assertStringContainsString('id="consumer-node-preview-' . $tab . '"', $html);
    }
  }

  /**
   * Tests that without targets the frontend tab says so, and Drupal opens.
   */
  public function testWithoutTargetsTheFrontendTabSaysSo(): void {
    $html = $this->html();
    $this->assertStringContainsString('data-consumer-node-preview-unconfigured', $html);
    $this->assertStringNotContainsString('<iframe', $html);
    $this->assertStringContainsString('id="consumer-node-preview-drupal-tab" class="tabs__link is-active"', $html);
  }

  /**
   * Tests that a site target from settings.php is framed with its tokens.
   */
  public function testSiteTargetIsFramed(): void {
    $this->setSetting('consumer_node_preview', [
      'targets' => [
        'frontend' => [
          'label' => 'Frontend',
          'url' => '/node/preview?vm=[view_mode]#[jsonapi_node_preview_path]',
        ],
      ],
    ]);
    $node = $this->node();
    $html = $this->html($node);
    $this->assertStringContainsString('<iframe src="/node/preview?vm=full#/jsonapi/node/page/' . $node->uuid() . '/preview"', $html);
    $this->assertStringNotContainsString('data-consumer-node-preview-unconfigured', $html);
    // The picker shows even with one target, so the editor sees which one.
    $this->assertStringContainsString('data-consumer-node-preview-target', $html);
  }

  /**
   * Tests that the default setting picks the target the frame opens on.
   */
  public function testTheDefaultTargetOpens(): void {
    $this->setSetting('consumer_node_preview', [
      'targets' => [
        'local' => ['label' => 'Local', 'url' => 'http://localhost:3000/[uuid]'],
        'live' => ['label' => 'Live', 'url' => 'https://example.com/[uuid]'],
      ],
      'default' => 'settings:live',
    ]);
    $node = $this->node();
    $html = $this->html($node);
    $this->assertStringContainsString('<iframe src="https://example.com/' . $node->uuid() . '"', $html);
    $this->assertStringContainsString('data-consumer-node-preview-target', $html);
  }

  /**
   * Tests that a consumer's target is listed, and the query picks it.
   */
  public function testTheQueryPicksConsumerTarget(): void {
    $consumer = Consumer::create([
      'label' => 'Nuxt',
      'client_id' => 'nuxt',
      'preview_targets' => [['label' => 'Staging', 'url' => 'https://staging.example.com/preview#[jsonapi_node_preview]']],
    ]);
    $consumer->save();
    $this->setSetting('consumer_node_preview', [
      'targets' => ['local' => ['label' => 'Local', 'url' => 'http://localhost:3000/']],
    ]);
    $request = Request::create('/', 'GET', ['frontend' => $consumer->id() . ':0']);
    $request->setSession(new Session(new MockArraySessionStorage()));
    $this->container->get('request_stack')->push($request);

    $node = $this->node();
    $html = $this->html($node);
    $this->assertStringContainsString('Nuxt: Staging', $html);
    $this->assertMatchesRegularExpression('#<iframe src="https://staging\.example\.com/preview\#http[^"]*/jsonapi/node/page/' . $node->uuid() . '/preview"#', $html);
  }

  /**
   * Tests that a stale frontend key in the query falls back to the default.
   */
  public function testStaleQueryKeyFallsBackToTheDefault(): void {
    $this->setSetting('consumer_node_preview', [
      'targets' => [
        'local' => ['label' => 'Local', 'url' => 'http://localhost:3000/[uuid]'],
        'live' => ['label' => 'Live', 'url' => 'https://example.com/[uuid]'],
      ],
      'default' => 'settings:live',
    ]);
    $request = Request::create('/', 'GET', ['frontend' => '9:9']);
    $request->setSession(new Session(new MockArraySessionStorage()));
    $this->container->get('request_stack')->push($request);

    $node = $this->node();
    $this->assertStringContainsString('<iframe src="https://example.com/' . $node->uuid() . '"', $this->html($node));
  }

  /**
   * Tests that the JSON:API tab and token include revisioned references.
   */
  public function testTheEndpointIncludesRevisionedReferences(): void {
    FieldStorageConfig::create([
      'field_name' => 'field_content',
      'entity_type' => 'node',
      'type' => 'entity_reference_revisions',
      'settings' => ['target_type' => 'node'],
    ])->save();
    FieldConfig::create([
      'field_name' => 'field_content',
      'entity_type' => 'node',
      'bundle' => 'page',
    ])->save();
    $this->container->get('router.builder')->rebuild();

    $node = $this->node();
    $this->assertSame('/jsonapi/node/page/' . $node->uuid() . '/preview?include=field_content', $this->preview($node)['#jsonapi_url']);
  }

  /**
   * Tests that the Layout select lists the framed target's layouts.
   */
  public function testTheLayoutSelectFollowsTheTarget(): void {
    $this->setSetting('consumer_node_preview', [
      'targets' => [
        'site' => ['label' => 'Site', 'url' => 'http://localhost:3000/[uuid]?layout=[layout]', 'layouts' => ['default', 'bare_page']],
        'plain' => ['label' => 'Plain', 'url' => 'https://example.com/[uuid]'],
      ],
      'default' => 'settings:site',
    ]);
    $node = $this->node();
    $build = $this->preview($node);
    $html = (string) $this->render($build);

    $this->assertStringContainsString('<iframe src="http://localhost:3000/' . $node->uuid() . '?layout=default"', $html);
    $this->assertStringContainsString('data-consumer-node-preview-layout', $html);
    $this->assertStringContainsString('<option value="bare_page">Bare page</option>', $html);

    $settings = $build['#attached']['drupalSettings']['consumerNodePreview'];
    $this->assertSame('default', $settings['layout']);
    $this->assertSame(NodePreviewController::LAYOUT_PLACEHOLDER, $settings['layoutPlaceholder']);
    $this->assertSame('http://localhost:3000/' . $node->uuid() . '?layout=' . NodePreviewController::LAYOUT_PLACEHOLDER, $settings['targets']['settings:site']['url']);
    $this->assertSame([
      ['name' => 'default', 'label' => 'Default'],
      ['name' => 'bare_page', 'label' => 'Bare page'],
    ], $settings['targets']['settings:site']['layouts']);
    $this->assertSame([], $settings['targets']['settings:plain']['layouts']);
  }

  /**
   * Tests that the query picks a layout the target lists, and only that.
   */
  public function testTheQueryPicksTheLayout(): void {
    $this->setSetting('consumer_node_preview', [
      'targets' => [
        'site' => ['label' => 'Site', 'url' => 'http://localhost:3000/?layout=[layout]', 'layouts' => ['default', 'preview']],
      ],
    ]);
    foreach (['preview' => 'preview', 'bogus' => 'default'] as $requested => $expected) {
      $request = Request::create('/', 'GET', ['layout' => $requested]);
      $request->setSession(new Session(new MockArraySessionStorage()));
      $this->container->get('request_stack')->push($request);
      $this->assertStringContainsString('<iframe src="http://localhost:3000/?layout=' . $expected . '"', $this->html());
    }
  }

  /**
   * Tests that the Layout select is left out when no target has layouts.
   */
  public function testNoLayoutsNoLayoutSelect(): void {
    $this->setSetting('consumer_node_preview', [
      'targets' => ['plain' => ['label' => 'Plain', 'url' => 'https://example.com/[uuid]?layout=[layout]']],
    ]);
    $node = $this->node();
    $html = $this->html($node);
    $this->assertStringNotContainsString('data-consumer-node-preview-layout', $html);
    $this->assertStringContainsString('<iframe src="https://example.com/' . $node->uuid() . '?layout="', $html);
  }

  /**
   * Builds core's preview bar the way core attaches it.
   *
   * @return array<string, mixed>
   *   The page_top render array.
   */
  protected function coresBar(): array {
    $node = $this->node();
    // Core's controller sets the view mode the form reads.
    CoreNodePreviewController::create($this->container)->view($node, 'full');
    return [
      'node_preview' => [
        '#type' => 'container',
        'view_mode' => $this->container->get('form_builder')->getForm(NodePreviewForm::class, $node),
      ],
    ];
  }

  /**
   * Makes a route the current one.
   *
   * @param string $route_name
   *   The route name.
   * @param array<string, string> $parameters
   *   The route's raw parameters.
   */
  protected function pushRoute(string $route_name, array $parameters): void {
    $request = Request::create('/');
    $request->attributes->set(RouteObjectInterface::ROUTE_NAME, $route_name);
    $request->attributes->set('_raw_variables', new ParameterBag($parameters));
    $request->attributes->set(RouteObjectInterface::ROUTE_OBJECT, $this->container->get('router.route_provider')->getRouteByName($route_name));
    $request->setSession(new Session(new MockArraySessionStorage()));
    $this->container->get('request_stack')->push($request);
  }

  /**
   * Returns an unsaved page, flagged as core's Preview button leaves it.
   */
  protected function node(): NodeInterface {
    $node = Node::create(['type' => 'page', 'title' => 'Unsaved']);
    $node->in_preview = TRUE;
    return $node;
  }

  /**
   * Returns the controller's build for a node's preview.
   *
   * @return array<string, mixed>
   *   The render array.
   */
  protected function preview(?NodeInterface $node = NULL): array {
    return NodePreviewController::create($this->container)->view($node ?? $this->node(), 'full');
  }

  /**
   * Returns the preview rendered to HTML.
   */
  protected function html(?NodeInterface $node = NULL): string {
    $build = $this->preview($node);
    return (string) $this->render($build);
  }

}
