# Sample media fixtures

Small files used by the media-upload smoke tests (`TC_MD_001`).

| File          | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `sample.jpg`  | Valid JPEG — primary positive-path upload            |
| `sample.png`  | Valid PNG — supported image format                   |
| `sample.pdf`  | Valid PDF — supported document format                |
| `sample.mp4`  | Minimal MP4 placeholder — supported video format     |
| `sample.exe`  | Unsupported format — drives the rejection path       |

Replace any of these with a larger real asset if a test needs richer content
(e.g. a genuinely playable video). Paths are referenced from `src/data/test-data.ts`.
