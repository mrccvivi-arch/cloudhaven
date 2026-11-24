import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { build } from "vite";

const output = await build({
  build: {
    write: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const files = Array.isArray(output) ? output.flatMap((result) => result.output) : output.output;
const html = files.find((file) => file.fileName === "index.html")?.source;
const script = files.find((file) => file.type === "chunk" && file.isEntry);
const styles = files.find((file) => file.fileName.endsWith(".css"));
if (!html || !script || !styles) throw new Error("Expected a single HTML entry, script, and stylesheet");

const standalone = String(html)
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${styles.source}\n</style>`)
  .replace(/<script type="module"[^>]*><\/script>/, "")
  .replace("</body>", () => `<script type="module">\n${script.code.replace(/<\/script/gi, "<\\/script")}\n</script>\n</body>`);

const destination = resolve(process.argv[2] || "dist/character-studio-offline.html");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, standalone);
console.log(`Standalone preview: ${destination}`);
