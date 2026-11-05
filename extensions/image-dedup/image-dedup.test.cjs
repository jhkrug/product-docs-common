"use strict";

// Run with: node --test extensions/image-dedup/*.test.cjs
// Runs the contentClassified step of the extension with a stand-in content
// catalog.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ext = require(path.join(__dirname, "image-dedup.js"));

function image(component, version, module, relative, contents) {
  const outPath = `${component}/${version}/${module}/_images/${relative}`;
  return {
    src: { component, version, module, family: "image", relative },
    out: { path: outPath },
    pub: { url: `/${outPath}` },
    contents: Buffer.from(contents),
  };
}

function run(files, config = {}, latest = {}) {
  const listeners = {};
  const messages = [];
  ext.register.call(
    {
      once: (event, fn) => {
        listeners[event] = fn;
      },
      getLogger: () => ({ info: (msg) => messages.push(msg) }),
    },
    { config },
  );
  const components = [...new Set(files.map((f) => f.src.component))].map(
    (name) => ({
      name,
      latest: { version: latest[name] },
    }),
  );
  listeners.contentClassified({
    contentCatalog: {
      getComponents: () => components,
      findBy: ({ family }) => files.filter((f) => f.src.family === family),
    },
  });
  return messages;
}

test("a translated copy of an English image links to the English image", () => {
  const en = image("c", "v1", "en", "a.png", "same");
  const de = image("c", "v1", "de", "a.png", "same");
  const messages = run([de, en]);
  assert.ok(en.out, "English image is published");
  assert.equal(de.out, undefined, "German copy is not published");
  assert.equal(de.pub.url, "/c/v1/en/_images/a.png");
  assert.match(messages[0], /Not publishing 1 duplicate images/);
});

test("a localized image is kept", () => {
  const en = image("c", "v1", "en", "a.png", "English text");
  const de = image("c", "v1", "de", "a.png", "German text");
  run([en, de]);
  assert.ok(en.out);
  assert.ok(de.out);
  assert.equal(de.pub.url, "/c/v1/de/_images/a.png");
});

test("version scope keeps identical images in different versions", () => {
  const v1 = image("c", "v1", "en", "a.png", "same");
  const v2 = image("c", "v2", "en", "a.png", "same");
  run([v1, v2], {}, { c: "v2" });
  assert.ok(v1.out);
  assert.ok(v2.out);
});

test("component scope links identical images to the latest version", () => {
  const v1 = image("c", "v1", "en", "a.png", "same");
  const v2 = image("c", "v2", "en", "a.png", "same");
  const v1de = image("c", "v1", "de", "a.png", "same");
  run([v1, v1de, v2], { scope: "component" }, { c: "v2" });
  assert.ok(v2.out);
  assert.equal(v1.out, undefined);
  assert.equal(v1de.out, undefined);
  assert.equal(v1.pub.url, "/c/v2/en/_images/a.png");
  assert.equal(v1de.pub.url, "/c/v2/en/_images/a.png");
});

test("identical images in different components are kept", () => {
  const a = image("a", "v1", "en", "x.png", "same");
  const b = image("b", "v1", "en", "x.png", "same");
  run([a, b], { scope: "component" });
  assert.ok(a.out);
  assert.ok(b.out);
});

test("an image with a unique size is not hashed", () => {
  const unique = image("c", "v1", "en", "u.png", "unique size");
  let read = 0;
  const contents = unique.contents;
  Object.defineProperty(unique, "contents", {
    get: () => {
      read++;
      return contents;
    },
  });
  run([unique, image("c", "v1", "en", "a.png", "x")]);
  // Read for the filter and the size only; a hash would read it again.
  assert.ok(read <= 2, `contents read ${read} times`);
  assert.ok(unique.out);
});

test("an unknown scope is an error", () => {
  assert.throws(() => run([], { scope: "site" }), /scope must be one of/);
});
