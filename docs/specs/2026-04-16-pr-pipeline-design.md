# PR-Pipeline — GitHub Actions + lokale Hooks

**Datum:** 2026-04-16
**Branch:** feat/github-pipeline
**Status:** Spec — bereit zur Implementierung

## Ziel

Jeder Pull Request gegen `develop` wird automatisch verifiziert, bevor er gemergt werden kann. Die Pipeline ist so gebaut, dass sie nicht nur die heutigen 17 Bones absichert, sondern strukturell verhindert, dass zukünftig Bones ohne Tests ins Repo wandern.

Parallel dazu bekommen Entwickler lokale Git-Hooks, die Linting und Formatting automatisch vor dem Commit durchziehen — so landen trivial-fixbare Issues gar nicht erst im PR.

Nicht im Scope: Release-Automation, npm-Publish, Deployments, Matrix-Tests über mehrere Node-Versionen. Diese Themen kommen später in einen separaten `release.yml`.

---

## Entscheidungen

### Option B: Coverage-Gate statt nur „Tests laufen lassen"

Die existierenden 17 Playwright Contract Specs werden in CI ausgeführt. Zusätzlich prüft ein eigenes Script, dass für **jeden** Bone im Repo eine Story und eine Contract-Spec existiert. Fehlt eines, blockt der PR. Damit schützt das CI die Disziplin, die heute per Code-Review erzwungen werden müsste.

Nicht gewählt: Option A (nur Tests laufen lassen — zu wenig strukturelle Garantie) und Option C (Refactor auf data-driven Tests — eigener Scope, eigener Branch).

### Lokale Hooks: Lefthook statt Husky

- Eine Dependency statt zwei (Lefthook ersetzt Husky + lint-staged)
- Native `stage_fixed`-Option staged gefixte Files automatisch neu
- Parallele Hook-Ausführung, Single-YAML-Config
- Tooling-Trend 2025/2026: Shopify, GitLab, evilmartians nutzen Lefthook in Produktion

### CI mutiert keinen Code

Kein Auto-Fix in CI. Gründe: Bot-Commits verschmutzen History, Race Conditions bei parallelen Pushes, verdeckt fehlende lokale Setups, erfordert Write-Token. Korrekturen erfolgen lokal (via Lefthook) oder manuell durch den Entwickler.

### Node 24, keine Matrix auf PR

Node 24 ist seit Oktober 2025 der Active LTS, Maintenance erst ab Oktober 2026, EOL April 2028. Matrix über mehrere Versionen (22, 24) verdoppelt die CI-Dauer des längsten Jobs — unnötig, solange wir primär Vue-Komponenten-Verhalten und nicht Node-API-Kompatibilität testen. Matrix gehört in einen späteren `release.yml`.

### Trigger: nur `pull_request`

Kein Push-Trigger auf `develop`, keine geplanten Läufe. Branch-Protection-Konfiguration auf GitHub (required status checks) ist nicht Teil dieses Specs, sondern Repo-Admin-Aufgabe nach dem Merge.

---

## Architektur

### Workflow-Struktur

```
.github/
  workflows/
    pr.yml                      # einziger PR-Workflow
  actions/
    setup/
      action.yml                # Composite Action: Node-Setup + npm ci (root + example)
scripts/
  check-bone-coverage.js        # Coverage-Gate (pure Node, zero deps)
lefthook.yml                    # lokale pre-commit Hooks
```

### Jobs in `pr.yml`

Alle vier Jobs laufen parallel. Alle sind als Required Checks vorgesehen (Branch-Protection-Config nicht Teil des Specs).

| Job             | Dauer (erwartet) | Kommando                              | Zweck                                       |
| --------------- | ---------------- | ------------------------------------- | ------------------------------------------- |
| `lint`          | ~20 s            | `npm run lint`                        | ESLint inkl. Prettier-Rule                  |
| `unit`          | ~30 s            | `npm run test:run`                    | Vitest Unit Tests                           |
| `coverage-gate` | ~2 s             | `node scripts/check-bone-coverage.js` | Struktur-Check: jeder Bone hat Story + Spec |
| `contract`      | ~3–5 min         | `npm run test:contract`               | Playwright gegen Histoire                   |

### Shared Setup via Composite Action

Vermeidet Duplikat-Setup in jedem Job:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` mit Node 24, `cache: 'npm'`, `cache-dependency-path` deckt `package-lock.json` **und** `example/package-lock.json` ab
3. `npm ci` im Root
4. `npm ci --prefix example` (Pflicht, weil `histoire.legacy.config.js` Peer-Deps aus `example/node_modules` alias-auflöst)

Die Composite Action wird vom `contract`-Job zusätzlich um einen Playwright-Browser-Install-Step mit eigenem Cache-Key ergänzt — nicht in der Composite Action selbst, weil die anderen drei Jobs den Browser nicht brauchen.

### Concurrency

```yaml
concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

Neuer Push auf denselben PR cancelt vorherige Runs. Spart CI-Minuten und gibt schnelleres Feedback.

### Artifacts bei Failure

Nur im `contract`-Job, nur on-failure: `playwright-report/` und `test-results/` hochladen. 7 Tage Retention. Bei grünen Runs keine Artifacts, um Storage sparsam zu halten.

---

## Coverage-Gate (`scripts/check-bone-coverage.js`)

Pure Node-Script, keine npm-Abhängigkeiten. Muss schnell und deterministisch sein.

### Logik

1. Liste alle `src/forms/bones/*Bone.vue`
2. Subtrahiere die Whitelist abstrakter/zusammengesetzter Bones (siehe unten)
3. Für jeden verbleibenden „echten" Bone:
   - Erwartet: `stories/bones/<PascalName>.story.vue`
   - Erwartet: `tests/contract/bone-widgets/<kebab-name>.spec.ts`
4. Fehlt eines der beiden Artefakte → stderr mit expliziter Meldung, Exit 1
5. Alles grün → Exit 0

### Whitelist (abstrakte oder zusammengesetzte Bones ohne eigene Spec)

Diese Files sind keine eigenständig testbaren Bone-Widgets:

- `bone.vue` — Basis-Wrapper, nicht direkt gerendert
- `boneLabel.vue`, `boneActions.vue` — Sub-Komponenten
- `filterBone.vue` — Filter-spezifischer Bone, separat zu testen
- `booleanBoneChoose.vue`, `booleanBoneSelect.vue` — Varianten, werden von `booleanBone.vue` abgedeckt
- `selectBoneChoose.vue` — Variante, abgedeckt von `selectBone.vue`
- `relationalBoneSelect.vue` — Variante, abgedeckt von `relationalBone.vue`
- `jsonBone.vue` — derzeit keine Story/Spec; wird vor Coverage-Gate-Einführung geprüft, ob drin oder draußen

Die Whitelist ist ein Array von Filenames im Script und wird bei Bedarf erweitert. **Jede Whitelist-Erweiterung ist eine bewusste Team-Entscheidung im Code-Review.**

### Output bei Fehlschlag (Beispiel)

```
Bone coverage check failed:
  - blobBone.vue: missing story (expected: stories/bones/BlobBone.story.vue)
  - blobBone.vue: missing contract spec (expected: tests/contract/bone-widgets/blob-bone.spec.ts)

Add the missing artefacts or extend the whitelist in scripts/check-bone-coverage.js.
```

---

## Lefthook-Konfiguration

`lefthook.yml` im Repo-Root:

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

`stage_fixed: true` bedeutet: Lefthook staged Files, die ESLint bzw. Prettier verändert haben, automatisch zurück in den Commit. Entwickler merken nichts — der Commit landet „sauber" im Repo.

### Installation

Lefthook wird als devDependency hinzugefügt. `package.json` bekommt ein `"prepare": "lefthook install"`. Dadurch installiert sich der Hook nach jedem `npm install` automatisch (inkl. für neue Team-Mitglieder, die das Repo klonen). Kein manueller Setup-Step nötig.

---

## Änderungen an bestehenden Files

### `package.json` — neue Scripts

```json
"scripts": {
  "lint": "eslint .",
  "format:check": "prettier --check .",
  "prepare": "lefthook install",
  ...
}
```

`format:check` ist kein CI-Job, sondern ein manuelles Tool für Entwickler. ESLint (mit Prettier-Rule) deckt Formatting im `lint`-Job ab.

### `package.json` — neue devDependency

- `lefthook`

### `eslint.config.js` — Prettier als Error

Aktuell: `"prettier/prettier": "warn"` → ESLint beendet mit Exit 0 trotz Formatting-Fehlern → CI schluckt's stumm.

Neu: `"prettier/prettier": "error"` → CI blockt bei Formatting-Verstößen.

### Einmalige Baseline-Bereinigung

Das Anheben auf `error` deckt mit hoher Wahrscheinlichkeit bestehende Formatting-Verstöße im Repo auf. Vorgehen:

1. `npx eslint . --fix` einmal ausführen
2. Diff prüfen (sollte nur Whitespace/Quotes/Semikola sein)
3. In einem dedizierten Baseline-Commit landen, bevor die Pipeline-Änderung grün wird

---

## Was NICHT gebaut wird (explizit ausgeschlossen)

- Keine Matrix über mehrere Node-Versionen — gehört in `release.yml`
- Keine push-to-develop-Trigger — vorerst nur PR
- Keine Deployment-Jobs, keine Artifact-Publishing nach npm
- Kein Auto-Fix/Auto-Commit im CI
- Kein Code-Coverage-Report-Upload (Coveralls/Codecov) — kann später ergänzt werden
- Keine Änderung an existierenden Tests (keine Migration auf data-driven Specs — das ist Option C, separater Scope)
- Keine Branch-Protection-Config — ist Repo-Admin-Aufgabe nach Merge

---

## Risiken und Gegenmaßnahmen

| Risiko                                                                | Gegenmaßnahme                                                                                                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Histoire-Dev-Server startet in CI nicht in 60 s                       | `reuseExistingServer: !process.env.CI` ist bereits gesetzt → in CI wird frisch gestartet. Timeout bei Bedarf auf 120 s in `playwright.config.ts` erhöhen. |
| `example/node_modules` fehlt → Alias-Resolving bricht                 | Composite Action führt `npm ci --prefix example` aus.                                                                                                     |
| Playwright-Browser-Download verlangsamt jeden Run                     | Eigener Cache-Key basierend auf Playwright-Version in `package-lock.json`.                                                                                |
| Coverage-Gate false-positive bei Refactor                             | Whitelist im Script ist explizit und änderbar; jede Änderung läuft über Code-Review.                                                                      |
| `prettier/prettier: "error"` bricht bestehenden Code auf einen Schlag | Einmalige `eslint --fix`-Baseline als separater Commit vor dem Pipeline-Commit.                                                                           |
| Lefthook-Hook stört lokal bei emergency commits                       | Standard-Escape `git commit --no-verify` funktioniert; CI fängt's trotzdem.                                                                               |

---

## Offene Punkte vor Implementierung

1. **Whitelist-Review**: Die Coverage-Gate-Whitelist (oben) wird während der Implementierung gegen den aktuellen Repo-Stand verifiziert. Insbesondere `jsonBone.vue` — ist aktuell keine Story/Spec vorhanden, Entscheidung: Whitelist oder Backlog-Task für fehlende Coverage.
2. **Playwright-Cache-Strategie**: Cache-Key aus Playwright-Version im Lockfile ableiten; bei Upgrade invalidiert er sich automatisch.
3. **Node-Version-Pinning**: `.nvmrc` mit `24` anlegen, damit lokale Dev-Umgebungen mit CI synchron bleiben.
