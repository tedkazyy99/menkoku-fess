import fs from "fs";

const formHtml = fs.readFileSync("src/views/form.html", "utf8");
const adminHtml = fs.readFileSync("src/views/admin.html", "utf8");

const tokensCss = fs.readFileSync("src/styles/tokens.css", "utf8");
const baseCss = fs.readFileSync("src/styles/base.css", "utf8");

const rawPageCss = fs.readFileSync("src/styles/page.css", "utf8")
  .replace('@import url("./tokens.css");', "")
  .replace('@import url("./base.css");', "");
const fullPageCss = tokensCss + "\n" + baseCss + "\n" + rawPageCss;

const rawAdminCss = fs.readFileSync("src/styles/admin.css", "utf8")
  .replace('@import url("./tokens.css");', "")
  .replace('@import url("./base.css");', "");
const fullAdminCss = tokensCss + "\n" + baseCss + "\n" + rawAdminCss;

const out =
  "// Inlined views and styles to guarantee 0 filesystem errors in serverless environments\n" +
  "export const formHtml = " + JSON.stringify(formHtml) + ";\n\n" +
  "export const adminHtml = " + JSON.stringify(adminHtml) + ";\n\n" +
  "export const pageCss = " + JSON.stringify(fullPageCss) + ";\n\n" +
  "export const adminCss = " + JSON.stringify(fullAdminCss) + ";\n";

fs.writeFileSync("src/views/templates.ts", out, "utf8");
console.log("Generated src/views/templates.ts successfully! Size:", out.length);

if (!fs.existsSync("public")) {
  fs.mkdirSync("public", { recursive: true });
}


