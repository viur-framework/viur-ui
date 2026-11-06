# PR-Pipeline & Commit-Hooks — Quick Reference

Praktischer Leitfaden für Entwickler, die im viur-ui Repo arbeiten. Alles, was du nach `git clone` wissen musst.

**Design-Doc:** `docs/specs/2026-04-16-pr-pipeline-design.md`
**Implementation-Plan:** `docs/plans/2026-04-16-pr-pipeline.md`

---

## 1. Nach `git clone` — Einmal-Setup

```bash
git clone git@github.com:akelch/viur-ui.git
cd viur-ui
git checkout develop

# Node-Version (empfohlen: nvm)
nvm use                           # liest .nvmrc → Node 24

# Deps installieren (pnpm-Workspace: Root + example/ in einem Rutsch)
pnpm install                      # installiert auch example/ (Peer-Deps für Histoire) und triggert 'lefthook install'
```

Nach `pnpm install` sind die Git-Hooks automatisch aktiv (via `prepare` Script in `package.json`).

---

## 2. Commit-Hooks (Lefthook)

### Was passiert beim `git commit`

Auf jeden Commit laufen — **parallel, nur auf staged Files** — zwei Jobs:

| Job        | Glob                          | Command                                     |
| ---------- | ----------------------------- | ------------------------------------------- |
| `eslint`   | `*.{js,vue}`                  | `pnpm exec eslint --fix {staged_files}`     |
| `prettier` | `*.{js,vue,json,md,yml,yaml}` | `pnpm exec prettier --write {staged_files}` |

Beide mit `stage_fixed: true` — gefixte Dateien werden automatisch neu gestaged und landen im Commit. Du merkst davon nichts, solange alles fixbar ist.

### Wann der Hook blockiert

Wenn ESLint einen nicht-fixbaren Verstoß findet (z. B. `no-restricted-syntax`, `vue/`-Regeln), schlägt der Hook fehl und der Commit wird **abgebrochen**. Du fixst die Meldung manuell und committest erneut.

### Hook manuell testen

```bash
# Dry-Run: staged Files gegen den Hook laufen lassen (ohne wirklichen Commit)
git add <file>
pnpm exec lefthook run pre-commit
```

### Hook bewusst umgehen (Notfall)

```bash
git commit --no-verify -m "..."
```

**CI fängt trotzdem.** Das ist kein echter Bypass — der `lint`-Job in GitHub Actions prüft später.

---

## 3. Tägliche Kommandos

### Linting & Formatting

```bash
pnpm lint              # ESLint über das ganze Repo (inkl. Prettier via Plugin)
pnpm format:check      # Nur Prettier-Check, keine Fixes
```

**Zum Fixen lokal:**

```bash
pnpm exec eslint . --fix
pnpm exec prettier --write .
```

### Tests

```bash
pnpm test:run          # Vitest Unit-Tests (einmalig)
pnpm test              # Vitest Watch-Mode (Dev)
```

### Bone-Coverage-Gate

```bash
node scripts/check-bone-coverage.js
```

Ausgabe bei Erfolg: `Bone coverage check passed (17 bones verified).`

---

## 4. CI-Pipeline (GitHub Actions)

Workflow: `.github/workflows/pr.yml`
**Trigger:** `pull_request` gegen `develop`
**Concurrency:** Neuer Push cancelt vorherigen Run

### Drei parallele Jobs

| Job                  | Dauer | Blockierend?                | Zweck                                    |
| -------------------- | ----- | --------------------------- | ---------------------------------------- |
| `Lint`               | ~20 s | `continue-on-error: true` ¹ | ESLint inkl. Prettier                    |
| `Unit Tests`         | ~30 s | `continue-on-error: true` ² | Vitest                                   |
| `Bone Coverage Gate` | ~2 s  | **ja**                      | Strukturcheck: jeder Bone hat eine Story |

¹ Bis Backlog-Task #9 (241 bestehende Lint-Errors) durch ist.
² Bis Backlog-Task #10 (3 failing Request-Tests) durch ist.

**Effektiv blockt aktuell nur der Coverage-Gate.** Nach Backlog-Abarbeitung werden die `continue-on-error`-Einträge entfernt und die Pipeline wird voll blockierend.

---

## 5. Neuen Bone hinzufügen

Der Coverage-Gate erzwingt: jeder echte Bone hat eine Story.

```
src/forms/bones/blobBone.vue              → Component
stories/bones/BlobBone.story.vue          → Histoire-Story (PascalCase)
```

**Namens-Konventionen sind fix:**

- File `<name>Bone.vue` (camelCase)
- Story `<Name>Bone.story.vue` (PascalCase)

Fehlt die Story → CI-Job rot → PR blockt.

### Ausnahmen (Whitelist)

Nicht-eigenständige Bones werden in `scripts/check-bone-coverage.js` in der `WHITELIST`-Konstante geführt. Aktuell:

- `bone.vue` — abstrakter Basis-Wrapper
- `filterBone.vue` — Filter-spezifisch, separate Test-Strategie
- `jsonBone.vue` — TODO, Story noch nicht geschrieben

**Die Whitelist zu erweitern ist eine bewusste Team-Entscheidung** — immer im PR-Body begründen.

---

## 6. Branch-Strategie

- **Integration:** `develop`
- **Release/Stable:** `main`
- Feature-Branches zweigen von `develop` ab, PRs gehen gegen `develop`

---

## 7. Troubleshooting

### Histoire startet nicht

Meistens fehlen die `example/`-Deps: `pnpm install` (ohne die bricht Histoire beim Laden von `@viur/webawesome/...`).

### Lefthook läuft nicht beim Commit

```bash
pnpm exec lefthook install    # reinstalliert den Git-Hook-Stub
cat .git/hooks/pre-commit   # sollte lefthook erwähnen
```

### Coverage-Gate failed für einen Bone, den ich gar nicht angefasst habe

Wahrscheinlich wurde eine Story-Datei umbenannt/verschoben. Check mit:

```bash
ls stories/bones/ src/forms/bones/widgets/
```

Zu jedem `<name>Bone.vue` muss es eine `<Name>Bone.story.vue` geben.

---

## 8. Technical Debt (Stand April 2026)

Zwei Punkte sind per Backlog-Task dokumentiert und lassen die CI derzeit nicht voll blockieren:

| #   | Beschreibung                                            | Wieviele                 |
| --- | ------------------------------------------------------- | ------------------------ |
| 9   | ESLint-Errors (`no-restricted-syntax`, `vue/`)          | 241 errors, 386 warnings |
| 10  | Failing Vitest-Tests in `tests/request/request.test.js` | 3 Tests                  |

Sobald ein Punkt abgeschlossen ist: `continue-on-error: true` aus dem entsprechenden Job in `.github/workflows/pr.yml` entfernen. Dann blockt der Job hart.

---

## 9. Was NICHT automatisch passiert

- **Branch Protection** auf GitHub ist Repo-Admin-Aufgabe — muss einmalig eingerichtet werden, Required Status Check: mindestens `Bone Coverage Gate`
- **Auto-Fix in CI** — bewusste Entscheidung: CI verifiziert, mutiert nicht. Formatting lokal via Lefthook, nie per CI-Bot-Commit
- **Release-Workflow** (Tagging, npm publish) — eigener `release.yml`, nicht Teil der PR-Pipeline
