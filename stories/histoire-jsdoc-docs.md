# Histoire: JSDoc → Dokumentation?

Recherche vom 2026-03-27 — Kann Histoire automatisch Dokumentation aus JSDoc-Kommentaren der Komponenten befüllen?

## Ergebnis

**Nein, Histoire hat kein eingebautes JSDoc → Docs Feature** — auch nicht in der aktuellen Beta v1.

## Was Histoire tatsächlich bietet

### 1. `<docs lang="md">` Block (manuell)

Markdown direkt in der `.story.vue`-Datei, wird als Docs-Tab gerendert:

```vue
<docs lang="md">
# SelectBone

Zeigt ein Dropdown für Enum-Werte an.
</docs>
```

### 2. `autoProps`

Histoire erkennt automatisch die Props einer Komponente (Name + Typ), aber **ohne** JSDoc-Beschreibungen. Kann pro Story oder global deaktiviert werden.

### 3. Standalone `.story.md`-Dateien

Reine Markdown-Seiten für allgemeine Dokumentation (z.B. Einführungsseiten).

## Alternativen zu vue-docgen-api

`vue-docgen-api` ist veraltet. Die moderne Alternative ist **`@vue/language-tools`** (Volar-Team), das `vue-component-meta` exportiert:

- Aktiv gepflegt, TypeScript-nativ
- Liest auch JSDoc-Kommentare (`@description`, `@default`, `@deprecated` etc.)
- Wird von **Storybook** intern für autodocs genutzt

Aber: Auch damit bräuchte man ein **Custom Vite Plugin**, das die Metadaten extrahiert und in Histoires `<docs>`-Block injiziert — nicht trivial.

## Optionen für viur-ui

| Option                                               | Aufwand | Ergebnis             |
| ---------------------------------------------------- | ------- | -------------------- |
| `<docs lang="md">` manuell schreiben                 | gering  | sauber, kontrolliert |
| Custom Vite Plugin mit `@vue/language-tools`         | hoch    | vollautomatisch      |
| Skript das Markdown aus JSDoc generiert (Build-Step) | mittel  | halbautomatisch      |

## Empfehlung

Manueller `<docs>`-Block in den Story-Dateien (wie im StringBone-Template als Vorlage eingerichtet). Die Bone-Komponenten haben aktuell keine JSDoc-Kommentare, die sich zu extrahieren lohnen würden.

Falls JSDoc-Kommentare in den Bone-Komponenten ergänzt werden sollen, wäre der halbautomatische Ansatz (Skript via `@vue/language-tools`) einen Blick wert.
