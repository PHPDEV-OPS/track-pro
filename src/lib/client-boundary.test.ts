import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A server component that imports a plain value (an array, a function) from a "use client" module
// receives a client reference, not the value, and crashes at render: /settings once failed with
// "SETTINGS_SECTIONS.map is not a function". Server files may only import components from client modules.

const SRC = path.resolve(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const all = files(SRC);
const isClient = (src: string) => /^\s*["']use client["']/.test(src);
const clientModules = new Set(
  all.filter((f) => isClient(readFileSync(f, "utf8"))).map((f) => "@/" + path.relative(SRC, f).replace(/\\/g, "/").replace(/\.tsx?$/, "")),
);

describe("server and client module boundary", () => {
  it("server files import only components (PascalCase) from client modules", () => {
    const problems: string[] = [];
    for (const f of all) {
      const src = readFileSync(f, "utf8");
      if (isClient(src)) continue;
      for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
        if (m[1] || !clientModules.has(m[3])) continue; // type only imports are erased
        for (const name of m[2].split(",").map((n) => n.trim().replace(/^type\s+/, "")).filter(Boolean)) {
          if (m[2].includes(`type ${name}`)) continue;
          if (!/^[A-Z][a-z]/.test(name)) problems.push(`${path.relative(SRC, f)} imports ${name} from ${m[3]}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
