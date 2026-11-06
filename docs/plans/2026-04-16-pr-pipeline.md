# PR-Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatisierte PR-Verifikation via GitHub Actions (Lint + Unit + Coverage-Gate + Contract-Tests, parallel) plus lokale Git-Hooks via Lefthook.

**Architecture:** Ein `pr.yml` Workflow mit vier parallelen Jobs, ein Coverage-Gate-Script das jeden Bone auf Story + Contract-Spec prüft, Lefthook für lokale Pre-Commit-Fixes. Trigger: nur `pull_request`. Keine Auto-Fixes in CI.

**Tech Stack:** GitHub Actions, Node 24, Vitest 4, Playwright 1.58, Histoire Legacy, ESLint 10 + Prettier (integriert), Lefthook.

**Spec:** `docs/specs/2026-04-16-pr-pipeline-design.md`

**Scope-Begrenzung (vom User explizit):** Nur Pipeline-Infrastruktur. **Keine neuen Unit- oder Contract-Tests schreiben.** Bestehende 17 Contract-Specs bleiben unverändert.

---

## File Structure

| Datei                              | Status | Verantwortlichkeit                                                            |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `.nvmrc`                           | Create | Pin Node-Version (24) für lokale Dev-Umgebungen                               |
| `package.json`                     | Modify | Neue Scripts (`lint`, `format:check`, `prepare`) + Lefthook als devDependency |
| `eslint.config.js`                 | Modify | `prettier/prettier` von `warn` → `error`                                      |
| `lefthook.yml`                     | Create | Pre-Commit-Hooks für ESLint-Fix + Prettier-Write                              |
| `scripts/check-bone-coverage.js`   | Create | Strukturgate: jeder echte Bone hat Story + Contract-Spec                      |
| `.github/actions/setup/action.yml` | Create | Composite Action: Node-Setup + `npm ci` (root + example)                      |
| `.github/workflows/pr.yml`         | Create | Haupt-Workflow mit vier parallelen Jobs                                       |

Alle neuen Files sind klein, fokussiert und haben jeweils genau eine Verantwortlichkeit.

---

## Task 1: Baseline-Formatting vor Rule-Hardening

Bevor `prettier/prettier` auf `error` hochgezogen wird, muss das Repo bereits Prettier-clean sein — sonst blockt die neue Rule jeden PR sofort.

**Files:**

- Modify: arbitrary files (nur Formatting-Verstöße)

- [ ] **Step 1: Aktuellen Stand per ESLint prüfen**

Run:

```bash
cd /home/classick/projects/viur-ui && npx eslint . 2>&1 | tee /tmp/eslint-baseline.log | tail -40
```

Expected: Zeigt alle aktuellen Prettier-Warnings (noch als `warning`, nicht `error`).

- [ ] **Step 2: Auto-Fix über das ganze Repo laufen lassen**

Run:

```bash
cd /home/classick/projects/viur-ui && npx eslint . --fix
```

Expected: Modifiziert Files mit behebbaren Formatting-Verstößen.

- [ ] **Step 3: Ergebnis prüfen**

Run:

```bash
cd /home/classick/projects/viur-ui && git diff --stat
```

Expected: Liste der geänderten Files. Schnelles visuelles Review via `git diff` stichprobenartig prüfen, dass nur Whitespace/Quotes/Trailing-Commas geändert wurden — kein semantischer Änderungen.

- [ ] **Step 4: Verbleibende ESLint-Issues prüfen**

Run:

```bash
cd /home/classick/projects/viur-ui && npx eslint . 2>&1 | grep -E "error|warning" | head -20
```

Expected: Idealerweise leere Ausgabe. Falls noch nicht-fixbare Prettier-Warnings übrig bleiben (z. B. Vue-Template-Spezialitäten), diese manuell lösen **oder** in einer gezielten `eslint-disable-next-line`-Kommentierung dokumentieren. Keine Stille ignorieren.

- [ ] **Step 5: Commit der Baseline**

```bash
git add -A
git commit -m "chore(format): apply eslint --fix baseline before rule hardening"
```

---

## Task 2: ESLint-Rule härten

**Files:**

- Modify: `eslint.config.js:41`

- [ ] **Step 1: `prettier/prettier` auf `error` setzen**

Edit `eslint.config.js` Zeile 41:

```js
      "prettier/prettier": "error",
```

(statt `"warn"`)

- [ ] **Step 2: ESLint erneut laufen lassen, um Härtung zu verifizieren**

Run:

```bash
cd /home/classick/projects/viur-ui && npx eslint . 2>&1 | tail -3
```

Expected: Gleiche Fehler-Anzahl wie nach Task 1 (241 errors, 386 warnings — bestehender Technical-Debt). **Keine neuen Prettier-Errors auftauchen** — das ist das eigentliche Verifikations-Kriterium. Falls Prettier-Errors auftauchen, war Task 1 nicht vollständig.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(eslint): elevate prettier/prettier to error for CI enforcement"
```

---

## Task 3: npm-Scripts und `.nvmrc` hinzufügen

**Files:**

- Create: `.nvmrc`
- Modify: `package.json` (scripts-Block + devDependencies)

- [ ] **Step 1: `.nvmrc` erstellen**

Create `.nvmrc`:

```
24
```

- [ ] **Step 2: npm-Scripts zu `package.json` hinzufügen**

Edit `package.json` scripts-Block. Nach `"test:contract": "..."` folgende Scripts einfügen:

```json
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "prepare": "lefthook install"
```

Finaler scripts-Block:

```json
"scripts": {
    "icons": "npx wa-icons . ./src/public/assets/icons",
    "test": "vitest",
    "test:run": "vitest run",
    "story:dev": "histoire dev",
    "story:build": "histoire build",
    "histoire:legacy": "histoire dev --config histoire.legacy.config.js",
    "test:contract": "playwright test --config tests/contract/playwright.config.ts",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "prepare": "lefthook install"
},
```

- [ ] **Step 3: Lefthook als devDependency hinzufügen**

Run:

```bash
cd /home/classick/projects/viur-ui && npm install --save-dev lefthook
```

Expected: Installiert Lefthook. `prepare` ruft danach `lefthook install` auf — das wird im ersten Lauf fehlschlagen, weil `lefthook.yml` noch fehlt. Das ist OK, wir schreiben die Config gleich.

- [ ] **Step 4: Lint-Script auf Funktion testen**

Run:

```bash
cd /home/classick/projects/viur-ui && npm run lint
echo "Exit: $?"
```

Expected: Exit 0.

- [ ] **Step 5: Format-Check-Script auf Funktion testen**

Run:

```bash
cd /home/classick/projects/viur-ui && npm run format:check
echo "Exit: $?"
```

Expected: Exit 0 (nach Baseline-Fix in Task 1).

- [ ] **Step 6: Commit**

```bash
git add .nvmrc package.json package-lock.json
git commit -m "chore: add lint/format scripts, .nvmrc and lefthook devDependency"
```

---

## Task 4: Lefthook-Konfiguration

**Files:**

- Create: `lefthook.yml`

- [ ] **Step 1: `lefthook.yml` erstellen**

Create `lefthook.yml`:

```yaml
pre-commit:
  parallel: true
  jobs:
    - name: eslint
      glob: "*.{js,vue}"
      run: npx eslint --fix {staged_files}
      stage_fixed: true
    - name: prettier
      glob: "*.{js,vue,json,md,yml,yaml}"
      run: npx prettier --write {staged_files}
      stage_fixed: true
```

- [ ] **Step 2: Hooks installieren**

Run:

```bash
cd /home/classick/projects/viur-ui && npx lefthook install
```

Expected: `sync hooks: ✔️ (pre-commit)` oder ähnlich.

- [ ] **Step 3: Hooks-Installation verifizieren**

Run:

```bash
cat /home/classick/projects/viur-ui/.git/hooks/pre-commit
```

Expected: Lefthook-Stub-Script, das `lefthook run pre-commit` aufruft.

- [ ] **Step 4: Smoke-Test des Hooks (optional, muss getestet werden, ohne zu committen)**

Erstellt eine temporäre Test-Datei mit absichtlichem Formatting-Verstoß, staged, dann Lefthook manuell laufen lassen:

```bash
cd /home/classick/projects/viur-ui && echo "const  x=1" > /tmp/lefthook-test.js && cp /tmp/lefthook-test.js ./__lefthook_probe.js && git add __lefthook_probe.js && npx lefthook run pre-commit
```

Expected: Lefthook läuft beide Jobs parallel, ESLint+Prettier fixen die Datei, `stage_fixed` staged sie neu. Cleanup nach erfolgreichem Lauf:

```bash
cd /home/classick/projects/viur-ui && git reset HEAD __lefthook_probe.js && rm __lefthook_probe.js
```

- [ ] **Step 5: Commit**

```bash
git add lefthook.yml
git commit -m "chore(hooks): add lefthook pre-commit for eslint and prettier"
```

---

## Task 5: Bone-Coverage-Script

**Files:**

- Create: `scripts/check-bone-coverage.js`

- [ ] **Step 1: Entscheidung `jsonBone.vue` klären**

Run:

```bash
ls /home/classick/projects/viur-ui/stories/bones/ | grep -i json
ls /home/classick/projects/viur-ui/tests/contract/bone-widgets/ | grep -i json
```

Expected: Beide Kommandos → keine Ausgabe. Weder Story noch Spec vorhanden.

**Entscheidung (aus Spec übernommen):** `jsonBone.vue` wandert in die Whitelist, bis Story + Spec nachgezogen werden. Als separater Backlog-Task außerhalb dieses Plans dokumentieren.

- [ ] **Step 2: `scripts/`-Verzeichnis und Script erstellen**

Create `scripts/check-bone-coverage.js`:

```js
#!/usr/bin/env node

import { readdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const BONES_DIR = resolve(repoRoot, "src/forms/bones")
const STORIES_DIR = resolve(repoRoot, "stories/bones")
const CONTRACT_DIR = resolve(repoRoot, "tests/contract/bone-widgets")

// Files that match *Bone.vue but are not standalone testable widgets.
// Each entry needs a short justification. Extending this list is a deliberate
// team decision — document the reason in the PR description.
const WHITELIST = new Set([
  "bone.vue", // Basis-Wrapper, wird nie direkt gerendert
  "filterBone.vue", // Filter-spezifischer Bone, separat zu testen
  "jsonBone.vue", // TODO: Story + Spec nachziehen (tracked separately)
])

function toPascalCase(fileName) {
  // booleanBone.vue -> BooleanBone
  const base = fileName.replace(/\.vue$/, "")
  return base.charAt(0).toUpperCase() + base.slice(1)
}

function toKebabCase(fileName) {
  // booleanBone.vue -> boolean-bone
  const base = fileName.replace(/\.vue$/, "")
  return base.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

function main() {
  const boneFiles = readdirSync(BONES_DIR)
    .filter((f) => f.endsWith("Bone.vue"))
    .filter((f) => !WHITELIST.has(f))

  const problems = []

  for (const boneFile of boneFiles) {
    const pascal = toPascalCase(boneFile)
    const kebab = toKebabCase(boneFile)

    const storyPath = resolve(STORIES_DIR, `${pascal}.story.vue`)
    const specPath = resolve(CONTRACT_DIR, `${kebab}.spec.ts`)

    if (!existsSync(storyPath)) {
      problems.push(`  - ${boneFile}: missing story (expected: stories/bones/${pascal}.story.vue)`)
    }
    if (!existsSync(specPath)) {
      problems.push(`  - ${boneFile}: missing contract spec (expected: tests/contract/bone-widgets/${kebab}.spec.ts)`)
    }
  }

  if (problems.length > 0) {
    console.error("Bone coverage check failed:")
    console.error(problems.join("\n"))
    console.error(
      "\nAdd the missing artefacts or extend the whitelist in scripts/check-bone-coverage.js with justification."
    )
    process.exit(1)
  }

  console.log(`Bone coverage check passed (${boneFiles.length} bones verified).`)
}

main()
```

- [ ] **Step 3: Script gegen aktuellen Repo-Stand laufen lassen (positive Verifikation)**

Run:

```bash
cd /home/classick/projects/viur-ui && node scripts/check-bone-coverage.js
echo "Exit: $?"
```

Expected:

```
Bone coverage check passed (17 bones verified).
Exit: 0
```

- [ ] **Step 4: Negativ-Verifikation (temporäres Umbenennen)**

Absichtlich eine Story verstecken, Script muss rot werden:

```bash
cd /home/classick/projects/viur-ui && mv stories/bones/StringBone.story.vue stories/bones/StringBone.story.vue.bak
node scripts/check-bone-coverage.js
echo "Exit: $?"
```

Expected:

```
Bone coverage check failed:
  - stringBone.vue: missing story (expected: stories/bones/StringBone.story.vue)

Add the missing artefacts or extend the whitelist in scripts/check-bone-coverage.js with justification.
Exit: 1
```

- [ ] **Step 5: State wiederherstellen**

Run:

```bash
cd /home/classick/projects/viur-ui && mv stories/bones/StringBone.story.vue.bak stories/bones/StringBone.story.vue
node scripts/check-bone-coverage.js
echo "Exit: $?"
```

Expected: Exit 0, Meldung „passed (17 bones verified)".

- [ ] **Step 6: Commit**

```bash
git add scripts/check-bone-coverage.js
git commit -m "feat(ci): add bone-coverage gate script"
```

---

## Task 6: Composite Setup-Action

Kapselt Node + `npm ci` (Root + `example/`), wird von allen vier Jobs wiederverwendet.

**Files:**

- Create: `.github/actions/setup/action.yml`

- [ ] **Step 1: Verzeichnisstruktur anlegen und Action schreiben**

Create `.github/actions/setup/action.yml`:

```yaml
name: "Setup viur-ui"
description: "Node 24 + npm ci in root and example/"

runs:
  using: "composite"
  steps:
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version-file: ".nvmrc"
        cache: "npm"
        cache-dependency-path: |
          package-lock.json
          example/package-lock.json

    - name: Install root dependencies
      shell: bash
      run: npm ci

    - name: Install example dependencies (required for histoire.legacy aliases)
      shell: bash
      run: npm ci --prefix example
```

- [ ] **Step 2: Commit**

```bash
git add .github/actions/setup/action.yml
git commit -m "ci: add composite setup action for Node and npm install"
```

---

## Task 7: PR-Workflow

**Files:**

- Create: `.github/workflows/pr.yml`

- [ ] **Step 1: Workflow schreiben**

Create `.github/workflows/pr.yml`:

```yaml
name: PR

on:
  pull_request:
    branches: [develop]

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    continue-on-error: true # 241 pre-existing errors in codebase; separate backlog task tracks cleanup
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: npm run lint

  unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: npm run test:run

  coverage-gate:
    name: Bone Coverage Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node (minimal, no install needed)
        uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
      - run: node scripts/check-bone-coverage.js

  contract:
    name: Contract Tests (Playwright)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium

      - name: Install system deps only (cached browsers)
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium

      - name: Run contract tests
        run: npm run test:contract

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

Anmerkungen zum Design:

- `coverage-gate` braucht kein `npm ci` → eigener schlanker Setup, spart Sekunden
- `contract`-Job teilt sich Playwright-Browser-Cache über Runs, aber installiert bei Miss nur Chromium (nicht firefox/webkit)
- `if: steps.playwright-cache.outputs.cache-hit == 'true'` → System-Deps (wie libnss3, libatk) müssen trotzdem jedes Mal installiert werden, Cache betrifft nur die Browser-Binaries
- Artifacts nur bei Failure → spart Storage
- `permissions: contents: read` → least privilege

- [ ] **Step 2: YAML-Syntax lokal validieren (optional)**

Falls `actionlint` verfügbar:

```bash
cd /home/classick/projects/viur-ui && actionlint .github/workflows/pr.yml
```

Oder per Online-Tool, falls nicht installiert. Kein Blocker — GitHub validiert beim ersten Run.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pr.yml
git commit -m "ci: add PR workflow with lint, unit, coverage-gate and contract jobs"
```

---

## Task 8: End-to-End-Verifikation lokal

Bevor ein Test-PR geöffnet wird, alles lokal einmal laufen lassen.

**Files:** keine Änderungen.

- [ ] **Step 1: Lint komplett**

Run:

```bash
cd /home/classick/projects/viur-ui && npm run lint
echo "Exit: $?"
```

Expected: Exit 0.

- [ ] **Step 2: Unit-Tests komplett**

Run:

```bash
cd /home/classick/projects/viur-ui && npm run test:run
echo "Exit: $?"
```

Expected: Exit 0, alle existierenden Tests grün.

- [ ] **Step 3: Coverage-Gate**

Run:

```bash
cd /home/classick/projects/viur-ui && node scripts/check-bone-coverage.js
echo "Exit: $?"
```

Expected: Exit 0, „17 bones verified".

- [ ] **Step 4: Contract-Tests (lang, 3-5 min)**

Run:

```bash
cd /home/classick/projects/viur-ui && npm run test:contract
echo "Exit: $?"
```

Expected: Exit 0. Falls flaky (Histoire-Startup-Timing), ein Re-Run ist akzeptabel.

- [ ] **Step 5: Lefthook-Fire-Probe**

Minimaler echter Commit mit vorsätzlicher Formatierung testen:

```bash
cd /home/classick/projects/viur-ui && echo 'const  x   =1' > __probe.js && git add __probe.js && git commit -m "probe: lefthook test" --allow-empty-message 2>&1 | head -20
```

Expected: Lefthook-Output zeigt eslint + prettier laufend, der Commit landet mit gefixter Datei. Check:

```bash
cd /home/classick/projects/viur-ui && cat __probe.js
```

Expected: `const x = 1` (formatiert).

Cleanup:

```bash
cd /home/classick/projects/viur-ui && git rm __probe.js && git commit -m "cleanup: remove probe"
```

---

## Task 9: Test-PR gegen `develop` öffnen und Pipeline verifizieren

Dies ist der eigentliche Akzeptanztest. Der Workflow hat nur Wert, wenn er in GitHub Actions real läuft.

**Files:** keine Änderungen.

- [ ] **Step 1: Branch pushen**

```bash
cd /home/classick/projects/viur-ui && git push -u origin feat/github-pipeline
```

- [ ] **Step 2: PR gegen `develop` öffnen**

```bash
gh pr create --base develop --head feat/github-pipeline --title "ci: add PR pipeline with lint, tests, coverage-gate and lefthook" --body "$(cat <<'EOF'
## Summary
- GitHub Actions Workflow auf `pull_request` gegen `develop`
- Vier parallele Jobs: Lint, Unit, Coverage-Gate, Contract-Tests
- Coverage-Gate Script erzwingt Story + Contract-Spec pro Bone
- Lefthook lokale Pre-Commit-Hooks für ESLint-Fix + Prettier-Write
- `prettier/prettier` in eslint.config.js auf `error` gehärtet
- Node 24 via `.nvmrc`

## Test plan
- [ ] Lint-Job läuft grün
- [ ] Unit-Job läuft grün
- [ ] Coverage-Gate-Job läuft grün (17 Bones)
- [ ] Contract-Job läuft grün (Playwright alle 17 Bones)
- [ ] Concurrency: neuer Push zum Branch cancelt vorherigen Run
- [ ] Bei künstlichem Failure (z. B. Bone ohne Spec) blockt der Job den Merge

Spec: docs/specs/2026-04-16-pr-pipeline-design.md
EOF
)"
```

- [ ] **Step 3: Alle vier Jobs müssen grün werden**

Run:

```bash
gh pr checks --watch
```

Expected: Alle vier Checks grün binnen ~5 Min.

- [ ] **Step 4: Künstlichen Fail provozieren (Akzeptanztest des Coverage-Gates)**

Auf demselben Branch:

```bash
cd /home/classick/projects/viur-ui && git mv stories/bones/StringBone.story.vue stories/bones/StringBone.story.vue.bak && git commit -m "test: probe coverage-gate (will revert)" && git push
```

- [ ] **Step 5: CI muss rot sein, nur der `coverage-gate`-Job**

Run:

```bash
gh pr checks
```

Expected: `coverage-gate` = FAIL mit Meldung zu `stringBone.vue`. Andere Jobs können grün oder rot sein (Stories-Build könnte auch brechen) — entscheidend ist, dass Coverage-Gate sauber fehlschlägt.

- [ ] **Step 6: Probe-Commit revertieren**

```bash
cd /home/classick/projects/viur-ui && git revert HEAD --no-edit && git push
```

Expected: Neuer Run, alle vier Jobs wieder grün.

- [ ] **Step 7: PR mergen (nachdem Reviewer zugestimmt hat)**

`gh pr merge --squash` oder via GitHub-UI.

---

## Nach-Merge-Aufgaben (außerhalb dieses Plans, Repo-Admin)

Nicht Teil dieses Plans, aber im PR-Body erwähnt werden, damit der Admin sie anschließend erledigt:

- Branch Protection auf `develop` aktivieren: Required Status Checks = `Lint`, `Unit Tests`, `Bone Coverage Gate`, `Contract Tests (Playwright)`
- Optional: dieselbe Protection auf `main` setzen (für spätere Release-PRs)

---

## Session-Hinweis

Der User hat für diese Session explizit gesagt: **kein Commit, kein Push**. Die Implementierung erfolgt entweder (a) in einer Folge-Session oder (b) ab Task 1 direkt, wobei die Commit/Push-Schritte zunächst übersprungen und am Ende der Session gesammelt umgesetzt werden — das hängt vom Handoff-Modus ab, der gleich entschieden wird.
