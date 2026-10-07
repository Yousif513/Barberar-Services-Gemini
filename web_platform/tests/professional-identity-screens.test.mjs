import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// G75 professional identity: the four screens are wired to commands that exist, show the server's reasons in both languages,
// carry every string in both languages, use the shared dialogs, never write a table from the browser, and mirror under RTL.
const here = fileURLToPath(new URL(".", import.meta.url));
const src = (...parts) => readFileSync(join(here, "..", "src", ...parts), "utf8");
const migrations = join(here, "..", "..", "supabase", "migrations");
const commandsSql = readdirSync(migrations).filter((f) => /^20261008400[01]/.test(f)).map((f) => readFileSync(join(migrations, f), "utf8")).join("\n");

const libSource = src("lib", "professional-identity.ts");
const compiled = ts.transpileModule(libSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const lib = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const screens = {
  public: src("app", "pro", "[handle]", "page.tsx"),
  publicLayout: src("app", "pro", "[handle]", "layout.tsx"),
  identity: src("app", "provider", "identity", "page.tsx"),
  profileForm: src("app", "provider", "identity", "_components", "profile-form.tsx"),
  portfolio: src("app", "provider", "identity", "_components", "portfolio-panel.tsx"),
  following: src("app", "customer", "following", "page.tsx"),
  link: src("app", "provider", "_components", "professional-link.tsx"),
};
const allScreens = Object.values(screens).join("\n");

describe("the server's reasons", () => {
  const internalOnly = new Set(["A handle is 3 to 30 characters: lowercase English letters, digits and single hyphens"]);
  const raised = [...new Set([...commandsSql.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")))];

  it("has an Arabic form for every reason the commands can raise", () => {
    assert.ok(raised.length > 30, `only ${raised.length} reasons found`);
    for (const message of raised) {
      const sample = message.replace(/%/g, "name");
      const arabic = lib.describeProfessionalError({ message: sample }, "ar");
      assert.ok(/[؀-ۿ]/.test(arabic) && !arabic.startsWith("تعذّر تنفيذ الطلب"), `no Arabic form for: ${message}`);
    }
    assert.ok(internalOnly.size === 1);
  });

  it("shows an unknown reason as the server wrote it", () => {
    assert.equal(lib.describeProfessionalError({ message: "something new" }, "en"), "something new");
    assert.match(lib.describeProfessionalError({ message: "something new" }, "ar"), /something new/);
  });
});

describe("copy", () => {
  const keysOf = (object) => Object.keys(object).sort();
  for (const name of ["publicCopy", "identityCopy", "followingCopy", "linkCopy"]) {
    it(`${name} has the same keys in English and Arabic, and Arabic text in the Arabic one`, () => {
      assert.deepEqual(keysOf(lib[name].ar), keysOf(lib[name].en));
      for (const [key, value] of Object.entries(lib[name].ar)) {
        const text = typeof value === "function" ? value(typeof value === "function" && value.length ? "x" : undefined) : value;
        if (key === "brand" || key === "switchLanguage") continue;
        assert.ok(typeof text === "string" && text.length > 0, `${name}.ar.${key} is empty`);
        assert.ok(/[؀-ۿ]/.test(String(text)), `${name}.ar.${key} has no Arabic: ${text}`);
      }
    });
  }
});

describe("helpers", () => {
  it("validates handles like the database does", () => {
    for (const ok of ["abc", "omar-barber", "a1b2c3", "x".repeat(30)]) assert.equal(lib.handleLooksValid(ok), true, ok);
    for (const bad of ["ab", "x".repeat(31), "Has-Upper", "a--b", "-ab", "ab-", "a_b", "عمر-حلاق", ""]) assert.equal(lib.handleLooksValid(bad), false, bad);
  });

  it("splits a comma list in both comma styles and drops blanks", () => {
    assert.deepEqual(lib.splitList("Fade, Beard،  Colour ,,\nPerm"), ["Fade", "Beard", "Colour", "Perm"]);
  });

  it("falls back to the other language when one is empty", () => {
    assert.equal(lib.pick("ar", "Omar", ""), "Omar");
    assert.equal(lib.pick("en", "", "عمر"), "عمر");
    assert.equal(lib.pick("ar", "Omar", "عمر"), "عمر");
  });
});

describe("wiring", () => {
  const rpcNames = (source) => [...source.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const defined = new Set([...commandsSql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]));

  it("calls only commands and reads that exist in the migrations", () => {
    const used = new Set(rpcNames(allScreens));
    assert.ok(used.size >= 10, `only ${used.size} calls found`);
    for (const name of used) assert.ok(defined.has(name), `${name} is not defined by the professional identity migrations`);
  });

  it("covers every command a person can run", () => {
    const used = new Set(rpcNames(allScreens));
    for (const name of ["public_professional_profile", "follow_professional", "unfollow_professional", "my_professional_identity",
      "save_professional_profile", "publish_professional_profile", "add_professional_portfolio_item", "remove_professional_portfolio_item",
      "respond_professional_invitation", "end_professional_link", "invite_professional_link", "provider_professional_links",
      "list_followed_professionals", "professional_handle_available"]) {
      assert.ok(used.has(name), `no screen calls ${name}`);
    }
  });

  it("never writes a table from the browser", () => {
    assert.doesNotMatch(allScreens, /supabase\s*\.from\(/, "these screens read and write through commands only");
  });

  it("opens the employee action from one import and one element", () => {
    const employees = src("app", "provider", "employees", "page.tsx");
    assert.equal((employees.match(/professional-link/g) ?? []).length, 1);
    assert.equal((employees.match(/<ProfessionalLinkAction /g) ?? []).length, 1);
  });

  it("adds one navigation entry to each portal, in both languages", () => {
    const provider = src("app", "provider", "layout.tsx");
    const customer = src("app", "customer", "layout.tsx");
    assert.equal((provider.match(/path: "\/provider\/identity"/g) ?? []).length, 1);
    assert.equal((provider.match(/identity: "/g) ?? []).length, 2);
    assert.equal((customer.match(/path: "\/customer\/following"/g) ?? []).length, 1);
    assert.equal((customer.match(/following: "/g) ?? []).length, 2);
  });
});

describe("standards", () => {
  it("uses no native dialogs", () => {
    assert.doesNotMatch(allScreens, /\b(window\.)?(confirm|alert|prompt)\(/);
  });

  it("uses the shared confirmation dialog for every command that changes standing", () => {
    for (const file of [screens.identity, screens.following, screens.portfolio, screens.link]) assert.match(file, /useConfirm|ask\(/);
  });

  it("mirrors under RTL: logical spacing and alignment only", () => {
    assert.doesNotMatch(allScreens, /\b(ml|mr|pl|pr)-\d/);
    assert.doesNotMatch(allScreens, /\btext-(left|right)\b/);
    assert.doesNotMatch(allScreens, /\b(left|right)-\d/);
  });

  it("opens the professional's own links safely", () => {
    assert.match(screens.public, /rel="noopener noreferrer nofollow ugc"/);
    assert.match(screens.public, /startsWith\("https:\/\/"\)/);
  });

  it("states what stays with a salon on the public and identity screens", () => {
    assert.match(lib.publicCopy.en.identityNote, /client list.*never travel/);
    assert.match(lib.identityCopy.en.staysBody, /none of that is copied or moved/);
    assert.match(lib.linkCopy.en.inviteIntro, /stay with you/);
  });

  it("keeps the public page free of anything private", () => {
    assert.doesNotMatch(screens.public, /\b(phone|email|address|profile_id|owner_id|employee_id)\b/i);
  });

  it("shows the professional a count and never a follower", () => {
    assert.match(screens.identity, /follower_count/);
    assert.doesNotMatch(screens.identity, /professional_follows|follower_id/);
  });
});
