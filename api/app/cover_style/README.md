# Cover style kit

Each folder (`v1`, `v2`, …) holds up to **five approved reference images** for one version of the cover look (v1 photoreal still life, v2 flat hand-drawn illustration).
When a folder has images, every cover is rendered through the MAI **edits** API with them attached, so all
covers share the same lighting, materials and finish. An empty folder falls back to text-to-image using the
prompt template in `app/covers.py`.

## Make the first set of references

```bash
cd api
uv run python -m scripts.covers refs --out ../.covers/refs-v2 --count 8
```

Open the folder, keep the 3–4 that best capture the look, and copy them here as `v2/01.png`, `v2/02.png`, …
Commit them. They ship inside the API image.

## Change the look later

1. Edit `PALETTES` / `_STYLE` in `app/covers.py` and/or add a new folder of references.
2. Bump `STYLE_VERSION` (e.g. `"v2"`) and deploy the API.
3. Start the API locally against Azure (`STORAGE_BACKEND=cosmos`, `IMAGE_ENDPOINT` set; the deployed API has internal-only ingress), then re-render covers on older versions, reusing each post’s saved concept:

```bash
uv run python -m scripts.covers plan http://localhost:8000 --out ../.covers/plan-v2.json   # renders candidates, changes nothing
uv run python -m scripts.covers apply http://localhost:8000 ../.covers/plan-v2.json        # swaps them in
```

Old images stay in Blob storage, so rolling back is just editing the post.
Posts with a real uploaded photo (no `cover` record) are never touched.
