import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("OHIF runtime config satisfies the bundled viewer contract", async () => {
  const source = await readFile(new URL("../ohif/app-config.js", import.meta.url), "utf8");
  const context = { window: {} };

  vm.runInNewContext(source, context, { filename: "ohif/app-config.js" });

  const config = context.window.config;
  assert.ok(config);
  assert.ok(Array.isArray(config.extensions));
  assert.ok(Array.isArray(config.modes));
  assert.equal(typeof config.customizationService, "object");
  assert.equal(config.defaultDataSourceName, "hospitalAOrthanc");

  const dataSource = config.dataSources.find((item) => item.sourceName === config.defaultDataSourceName);
  assert.ok(dataSource);
  assert.equal(dataSource.configuration.qidoRoot, "https://localhost:3443/dicomweb");
  assert.equal(dataSource.configuration.wadoRoot, "https://localhost:3443/dicomweb");
  assert.equal(dataSource.configuration.qidoRoot.includes(":8042"), false);
});
