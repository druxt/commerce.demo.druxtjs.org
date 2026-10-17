# Vendored: consumer_node_preview

A copy of the Consumer Node Preview module, carried here until it is released
on Drupal.org, when `composer require drupal/consumer_node_preview` replaces
this directory.

| | |
| --- | --- |
| Commit | `1fc4d13` (branch `feature/1-preview-layouts`) |
| Taken | What `git archive 1fc4d13` exports, which the module's `.gitattributes` keeps to the distributed set, without the three files that still slip through it (`.gitlab-ci.yml`, `CONTRIBUTING.md`, `phpunit.gitlab-ci.xml`), plus its tests, which the export leaves out and the site's suite runs |
| Changed | The browser tests under `tests/src/FunctionalJavascript` are left out: the site's suite runs without a WebDriver |
