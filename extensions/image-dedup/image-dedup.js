"use strict";

// Antora extension: publish each identical image only once.
// See README.md in this directory.
//
// After the content is classified, images with the same bytes in the same
// scope form a group. One file of the group (the canonical file) is
// published. The other files are not written, and their URL (pub) is set to
// the canonical file, so pages that reference them link to the canonical
// copy. A localized image has different bytes, so it is always kept.

const crypto = require("node:crypto");

const SCOPES = ["version", "component"];

module.exports.register = function ({ config = {} }) {
  const logger = this.getLogger("image-dedup");
  const scope = config.scope || "version";
  const preferModule = config.preferModule || "en";
  if (!SCOPES.includes(scope)) {
    throw new Error(
      `image-dedup: scope must be one of ${SCOPES.join(", ")}, not '${scope}'`,
    );
  }

  this.once("contentClassified", ({ contentCatalog }) => {
    const images = contentCatalog
      .findBy({ family: "image" })
      .filter((file) => file.out && file.pub && file.contents);
    const scopeKey = (file) =>
      scope === "version"
        ? `${file.src.component}@${file.src.version}`
        : file.src.component;

    // Only images with the same size in the same scope can be identical, so
    // only those are hashed.
    const bySize = groupBy(
      images,
      (file) => `${scopeKey(file)}|${file.contents.length}`,
    );
    const groups = [];
    for (const sameSize of bySize.values()) {
      if (sameSize.length < 2) continue;
      const byHash = groupBy(sameSize, (file) =>
        crypto.createHash("sha256").update(file.contents).digest("hex"),
      );
      for (const group of byHash.values())
        if (group.length > 1) groups.push(group);
    }

    const latest = new Map(
      contentCatalog.getComponents().map((c) => [c.name, c.latest?.version]),
    );
    const rank = (file) => [
      file.src.module === preferModule ? 0 : 1,
      file.src.version === latest.get(file.src.component) ? 0 : 1,
      file.out.path.length,
    ];
    const compare = (a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++)
        if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return a.out.path.localeCompare(b.out.path);
    };

    let count = 0;
    let bytes = 0;
    for (const group of groups) {
      group.sort(compare);
      const canonical = group[0];
      for (const file of group.slice(1)) {
        file.pub = { ...canonical.pub };
        delete file.out;
        count++;
        bytes += file.contents.length;
      }
    }
    logger.info(
      `Not publishing ${count} duplicate images (${(bytes / 1e6).toFixed(0)} MB), scope: ${scope}`,
    );
  });
};

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    group ? group.push(item) : groups.set(key, [item]);
  }
  return groups;
}
