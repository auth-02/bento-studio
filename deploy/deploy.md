# Deploy with dak

Publish a **gallery** (what visitors view) or the **Studio** (the editor) to a
shareable URL using dak.

Throughout, `dak` means:
```bash
python3 ~/.claude/skills/dak/scripts/dak.py
```

---

## Prerequisites (once per machine)

**Don't have the dak skill?** Get it from
<https://github.com/auth-02/skills/tree/main/dak> and place it at
`~/.claude/skills/dak/` (so `~/.claude/skills/dak/scripts/dak.py` exists). Then
the `dak` shorthand above works.

```bash
dak doctor          # checks config + credentials
```
If config is missing, run `dak setup` — needs a Cloudflare API token with
**Workers Scripts: Edit**, your account ID, and your workers.dev subdomain.

---

## The golden rule: deploy the folder, not the zip

Every export comes in two shapes:

- **Single file** (`.html`) — self-contained, works offline, opens anywhere. It's
  the re-editable **master**, but it's large (media inlined once, ~25–30 MB) and
  can exceed Cloudflare's **25 MB per-asset cap**.
- **Folder (zip)** — a tiny `index.html` beside an `assets/` folder. **This is
  what you host:** the page loads fast and the big files stay separate.

> **Always unzip the bundle and publish the folder.** If you publish a `.zip`
> directly, dak serves a *download page*, not a live page. Keep the single-file
> `.html` locally as your master; deploy the folder.

The generic flow for any zip bundle:
```bash
mkdir -p /tmp/deploy && unzip -o <bundle>.zip -d /tmp/deploy
dak /tmp/deploy --slug <slug> --title "<Title>"
```

---

## Deploy a gallery (live, viewable page)

A gallery is the finished composition your visitors see — read-only to them
(links, images, video, documents, stories all work), but it can still be reopened
in the Studio to keep editing.

```bash
mkdir -p /tmp/gallery-deploy
unzip -o examples/luffy/gallery/luffy-gallery.zip -d /tmp/gallery-deploy
dak /tmp/gallery-deploy --slug luffy-gallery --title "Luffy Gallery"
# → https://luffy-gallery.<subdomain>.workers.dev
```

---

## Deploy the Studio (the editor)

**A. Blank Studio — the app itself** (`bento-studio.html`, ~0.2 MB, no gallery
inside). It's a single self-contained file, so publish it directly:
```bash
dak bento-studio.html --slug studio --title "Bento Studio"
# → https://studio.<subdomain>.workers.dev
```

**B. Studio with a gallery already loaded** — export as *A Studio copy → Folder
(.zip)*, then deploy the folder:
```bash
mkdir -p /tmp/studio-deploy
unzip -o examples/luffy/studio/luffy-studio.zip -d /tmp/studio-deploy
dak /tmp/studio-deploy --slug luffy-studio --title "Luffy — Studio"
# → https://luffy-studio.<subdomain>.workers.dev
```
Opening the URL loads the editor with the gallery already in it, ready to edit.

> A hosted Studio edits fine, but its media are served from `assets/` (paths, not
> inlined). Treat it as a working instance; the single-file `.html` is the
> portable master you re-export from.

---

## Slug guidance

The **slug** is the first label in the URL — treat it as the product name.
Follow this convention (the `mybento` subdomain already carries "bento", so
slugs don't repeat it):

| What it is | Slug format | Example |
|---|---|---|
| The blank editor app (one, shared) | `studio` | `studio.mybento…` |
| WIP bento (editable draft, still cooking) | `<name>-studio` | `luffy-studio.mybento…` |
| Finished gallery (the shareable, view-only piece) | `<name>-gallery` | `luffy-gallery.mybento…` |

- lowercase, hyphenated, stable — one `<name>` per bento (`luffy` → `luffy-studio` / `luffy-gallery`).
- keep the slug the same across redeploys so the URL stays put and updates in place.

---

## Update / take down / list

```bash
# update in place — same slug redeploys to the same URL
dak /tmp/gallery-deploy --slug luffy-gallery --title "Luffy Gallery"

# take a site down (deletes the worker + removes it from the manifest)
dak unpublish luffy-gallery

# see everything you've published
dak list
```

---

## Notes

- **Size cap:** 25 MB per asset on Cloudflare Workers — the zipped folder stays
  well under it; a single-file page can exceed it and fail, so host the folder.
- **Reopening to edit:** a deployed gallery can be imported back into the Studio
  ("Open a gallery…") — export is not a one-way door.
- **Custom domain:** every `*.workers.dev` URL reads as a dev link. For a true
  product URL (`gallery.yourbrand.com`), add a domain to your Cloudflare account —
  an additive change that leaves all other sites untouched.
