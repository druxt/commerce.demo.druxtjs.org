# Local patches

Patches kept in the repo rather than referenced by URL, because each is a
reworked version of work that is still open upstream. Each is a replacement for
what is on its issue, not a parallel fix, and is intended to be offered back once
it has proven itself here.

## `2942975-layout-builder-jsonapi-drupal11.patch`

Issue: [#2942975 Expose Layout Builder data to REST and
JSON:API](https://www.drupal.org/project/drupal/issues/2942975)

Drupal does not serve Layout Builder sections over JSON:API.
`layout_builder__layout` exists as a field on `node` and `commerce_product` and
appears in neither response, because `LayoutSectionItemList::defaultAccess()`
returns `AccessResult::forbidden()` for every operation, with a `@todo` pointing
at this very issue.

Without it a decoupled frontend cannot render a Layout Builder page at all. It
resolves the route, fetches the entity, and emits an empty
`<div class="layout_builder">`, which is exactly what this demo did.

The issue is **Postponed** and has been since 2022, with 277 comments. The last
patch, `2942975-199.patch` from 24 June 2022, no longer applies to Drupal 11:
four of sixteen hunks fail and the module fatals on load once the rest is in
place. This is that patch rerolled against 11.4.5.

### What changed in the reroll

- **`SectionData::setValue()` hunk dropped.** Core caught up. 11.4.5 already
  calls `Section::fromArray($value)` when given an array, which is the part that
  mattered.
- **`Section.php` docblock hunk dropped.** It narrowed a fully qualified return
  type to a short one, which is a step backwards and unrelated to the issue.
- **Normalizer return types.** Drupal 11 declares return types the 2022 patch
  predates. `LayoutEntityDisplayNormalizer::normalize()` now returns `array` and
  `denormalize()` returns `mixed`, matching `ConfigEntityNormalizer`.
- **`SectionDataNormalizer` rewritten against the new base.** Drupal 11 split
  `TypedDataNormalizer::normalize()` into a `doNormalize()` hook. The old
  override called `parent::normalize()` and then `->toArray()` on the result,
  which now fails inside the parent because a `Section` is not an allowed return
  type. It overrides `doNormalize()` instead and converts there.
- **`layout_builder.schema.yml`** gains `type` and `uuid` on the `inline_block`
  mapping, applied by hand because the surrounding block gained constraints.
  They go after `block_serialized`, so its `nullable` and `Serialized` stay
  with it, and neither key is required: blocks saved before the patch lack them.

- **`SectionDataNormalizer::getSupportedTypes()` added, and it is not cosmetic.**
  The 2022 patch registers the normalizer as a child of
  `serializer.normalizer.typed_data` at raised priority and has it implement
  `DenormalizerInterface`, but never narrows what it claims. It therefore
  inherits `TypedDataNormalizer`'s `TypedDataInterface::class`, and
  `NormalizerBase::supportsDenormalization()` matches any subclass of that. Every
  `FieldItemList` is typed data, so the normalizer won the denormalization of
  *every field on every content entity* and returned a `Section` in place of the
  field value. It surfaced here as `PATCH /jsonapi/carts/{order}/items/{item}`
  returning HTTP 500 with `getBundleFromValues(): Return value must be of type
  ?string, Drupal\layout_builder\Section returned`, but the fault was not
  Commerce's: any JSON:API write to any content entity hit it. Overriding
  `getSupportedTypes()` to return `SectionData::class` alone confines it. Worth
  raising on the issue, since it affects the upstream patch as written.

### Verified

Applies and reverses cleanly against Drupal 11.4.5, with a forward dry run after
a full reverse to prove it is not depending on the tree it was cut from.

With it applied, the Kickstart landing page serves six sections over JSON:API:
two `cklb_slideshow` sections of three components each, a
`bootstrap_layout_builder:blb_col_1`, a `blb_col_2` of four, a `blb_col_1`
carrying `views_block:blog-latest_blog_block`, and a `blb_col_4` of four images.

### Still to do before offering it upstream

The 2022 patch's own test additions are carried where they applied, but
`SectionDataNormalizerTest` and one hunk of
`LayoutBuilderEntityViewDisplayResourceTestBase` need reworking for the
`doNormalize()` split before this is worth posting to the issue.

`composer-exit-on-patch-failure` is set to `true` alongside this, because
`cweagans/composer-patches` 1.x otherwise reports "Could not apply patch!
Skipping" and continues, leaving a half-patched tree that looks installed.
