import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyDemoDataMigrations, createSeedData } from "./seed.js";

export class JsonStore {
  constructor(filePath = path.join("data", "hipass-db.json")) {
    this.filePath = filePath;
    this.data = null;
  }

  async load() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.data = JSON.parse(await readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.data = createSeedData();
      await this.save();
    }
    if (applyDemoDataMigrations(this.data)) {
      await this.save();
    }
    return this.data;
  }

  get collectionNames() {
    return Object.keys(this.data ?? {});
  }

  get(name) {
    if (!this.data) throw new Error("Store is not loaded");
    return this.data[name];
  }

  set(name, value) {
    if (!this.data) throw new Error("Store is not loaded");
    this.data[name] = value;
  }

  async health() {
    return { database: this.data ? "UP" : "DOWN" };
  }

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
