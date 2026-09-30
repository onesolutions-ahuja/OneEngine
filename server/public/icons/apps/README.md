# App icons

Add or replace an app image here, then refresh or rebuild to see the change. PNG and JPG/JPEG are supported; SVG is also supported as an image. Keep the file extension consistent with its contents.

Use square images around 128 x 128 px with a neutral grayscale design. An explicit package image path is tried first; otherwise the launcher checks `/icons/apps/<app-key>.png`, `.jpg`, `.jpeg`, then `.svg`. Keys are lowercase with hyphens (`uber_eats` becomes `uber-eats.png`). Place a PNG/JPG using that name to override the SVG default without React changes. Missing images fall back to the app's Icon Library key, then `default-app.svg`.