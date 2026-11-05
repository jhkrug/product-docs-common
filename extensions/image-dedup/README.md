# image-dedup

An Antora extension that publishes each identical image only once.

Translated modules (`de`, `es`, `fr`, `ja`, `pt`, `zh`) usually contain a copy
of every English image. Each copy is written to the site, so one screenshot can
be published seven times in each version. The Rancher product documentation
had 24,092 published images (3,891 MB), but only 3,497 of them were unique.

## How it works

After Antora classifies the content, the extension compares the bytes of all
published images in a scope (see `scope`):

* Images with the same bytes form a group. One image of the group (the
  canonical image) is published.
* The other images of the group are not written to the site. Their URL is set
  to the canonical image, so pages that reference them link to the canonical
  copy. For example, `de/_images/install.png` is not published, and German
  pages show `en/_images/install.png`.
* An image with different bytes is always kept. A localized screenshot (for
  example, a GUI with German text) is published in its own module. You do not
  have to change the content or the translation workflow.

To select the canonical image, the extension uses these rules in sequence:

1. An image in the `prefer_module` module (default `en`).
2. An image in the latest version of the component (applies to
   `scope: component`).
3. The image with the shortest output path.

Only images with the same size are hashed, so the extension adds a few seconds
to a build.

## Enable the extension

The extension does nothing until a playbook includes it:

```yaml
antora:
  extensions:
    - id: image-dedup
      require: ./product-docs-common/extensions/image-dedup/image-dedup.js
      enabled: true
```

To include the extension but keep it off, set `enabled: false`. To turn it on
for one build only, use `npx antora --extension image-dedup <playbook>`.

## Options

| Option | Default | Description |
|---|---|---|
| `scope` | `version` | `version`: compare the images in one version of a component (across languages). `component`: compare the images in all versions of a component. |
| `prefer_module` | `en` | The module whose image is published when a group has an image in it. |

## Effects on URLs

Page URLs do not change. Image URLs can change:

* With both scopes, the URLs of the duplicate copies are not published. An
  external link directly to such a copy, for example
  `v1.7/de/_images/install.png`, gets a 404 error.
* With `scope: component`, the canonical image is in the latest version. When
  a new version is released, images that are the same in older versions move
  to the new version, and their URLs change. This can affect external links,
  image search, and the HTML of older versions at each release. Each version
  also depends on the images of another version. Use `component` only if the
  size saving is more important than stable image URLs.

## Results

Rancher product documentation playbook, November 2026, one full build for
each row:

| | Images published | GitHub Pages artifact (uncompressed) |
|---|---|---|
| Without the extension | 24,092 files, 3,891 MB | 9,622 MB |
| `scope: version` | 8,686 files, 1,238 MB | about 6,340 MB |
| `scope: component` | 3,640 files, 377 MB | about 5,260 MB |

The artifact size includes the symbolic links that the
`versions-latest-prerelease` extension makes (for example, `latest`). The
upload step copies the files of each link into the artifact.

## Test

```sh
node --test extensions/image-dedup/*.test.cjs
```
