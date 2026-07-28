# Sample media for upload tests

The Library upload specs (gated behind `CMS_ALLOW_DESTRUCTIVE=true`) expect
these files. They are intentionally **not** committed — drop your own small
samples here, or copy from the repo's existing `data/` folder:

| File         | Purpose                            |
| ------------ | ---------------------------------- |
| `sample.jpg` | Valid image upload                 |
| `sample.mp4` | Valid video upload                 |
| `sample.exe` | Unsupported-format rejection       |
| `large.bin`  | Large-file / upload-time edge case |

Generate placeholders quickly:

```bash
# tiny JPG/MP4: copy any real small media here
cp ../../../data/sample.jpg ./sample.jpg
cp ../../../data/sample.exe ./sample.exe
# 50 MB dummy for the large-file path
head -c 52428800 /dev/zero > large.bin
```
