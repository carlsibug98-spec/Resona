// maps @/x imports to ../src/x for the unseed E2E simulation
import { pathToFileURL } from "node:url";
import path from "node:path";

const srcRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = specifier.slice(2);
    const candidates = [
      path.join(srcRoot, target) + ".ts",
      path.join(srcRoot, target) + ".tsx",
      path.join(srcRoot, target, "index.ts"),
      path.join(srcRoot, target, "index.tsx"),
    ];
    for (const c of candidates) {
      try {
        return await nextResolve(pathToFileURL(c).href, context);
      } catch {
        /* try next */
      }
    }
  }
  return nextResolve(specifier, context);
}
