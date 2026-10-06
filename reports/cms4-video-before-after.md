# CMS4 video: BEFORE (source) vs AFTER (library)

Source kbps = file bytes*8 / duration (duration taken from library entry; includes audio). Codec not probed (no ffprobe).

| # | Res | BEFORE ext | BEFORE MB | BEFORE ~kbps | AFTER ext | AFTER MB | AFTER kbps | Size change | Dur s | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 640x360 | .3gp | 0.55 | 354 | .mp4 | 0.55 | 341 | 1.0x | 13 | remuxed (same size) |
| 2 | 1280x720 | .3gp | 16.63 | 4982 | .mp4 | 16.63 | 4937 | 1.0x | 28 | remuxed (same size) |
| 3 | 1920x1080 | .3gp | 36.48 | 10928 | .mp4 | 36.48 | 10834 | 1.0x | 28 | remuxed (same size) |
| 4 | 2560x1440 | .3gp | 66.41 | 19895 | .mp4 | 66.41 | 19726 | 1.0x | 28 | remuxed (same size) |
| 5 | 3840x2160 | .3gp | 126.48 | 37891 | .mp4 | 126.48 | 37571 | 1.0x | 28 | remuxed (same size) |
| 6 | 640x360 | .avi | 0.56 | 359 | .mp4 | 0.95 | 596 | 1.7x | 13 | re-encoded, larger |
| 7 | 1280x720 | .avi | 4.20 | 1260 | .mp4 | 15.19 | 4512 | 3.6x | 28 | re-encoded, larger |
| 8 | 1920x1080 | .avi | 9.45 | 2831 | .mp4 | 34.3 | 10188 | 3.6x | 28 | re-encoded, larger |
| 9 | 2560x1440 | .avi | 15.76 | 4722 | .mp4 | 57.2 | 16993 | 3.6x | 28 | re-encoded, larger |
| 10 | 3840x2160 | .avi | 34.02 | 10192 | .mp4 | 108.99 | 32376 | 3.2x | 28 | re-encoded, larger |
| 11 | 640x360 | .flv | 0.60 | 386 | .mp4 | 0.85 | 533 | 1.4x | 13 | re-encoded, larger |
| 12 | 1280x720 | .flv | 4.71 | 1411 | .mp4 | 15.05 | 4470 | 3.2x | 28 | re-encoded, larger |
| 13 | 1920x1080 | .flv | 10.66 | 3194 | .mp4 | 33.93 | 10078 | 3.2x | 28 | re-encoded, larger |
| 14 | 2560x1440 | .flv | 18.25 | 5469 | .mp4 | 56.23 | 16703 | 3.1x | 28 | re-encoded, larger |
| 15 | 3840x2160 | .flv | 40.52 | 12139 | .mp4 | 107.16 | 31834 | 2.6x | 28 | re-encoded, larger |
| 16 | 640x360 | .mkv | 0.55 | 353 | .mp4 | 0.55 | 341 | 1.0x | 13 | remuxed (same size) |
| 17 | 1280x720 | .mkv | 16.63 | 4981 | .mp4 | 16.63 | 4938 | 1.0x | 28 | remuxed (same size) |
| 18 | 1920x1080 | .mkv | 36.47 | 10927 | .mp4 | 36.48 | 10834 | 1.0x | 28 | remuxed (same size) |
| 19 | 2560x1440 | .mkv | 66.40 | 19894 | .mp4 | 66.41 | 19727 | 1.0x | 28 | remuxed (same size) |
| 20 | 3840x2160 | .mkv | 126.47 | 37890 | .mp4 | 126.48 | 37573 | 1.0x | 28 | remuxed (same size) |
| 21 | 640x360 | .mov | 0.55 | 354 | .mp4 | 0.55 | 341 | 1.0x | 13 | remuxed (same size) |
| 22 | 1280x720 | .mov | 16.63 | 4982 | .mp4 | 16.63 | 4937 | 1.0x | 28 | remuxed (same size) |
| 23 | 1920x1080 | .mov | 36.48 | 10928 | .mp4 | 36.48 | 10834 | 1.0x | 28 | remuxed (same size) |
| 24 | 2560x1440 | .mov | 66.41 | 19895 | .mp4 | 66.41 | 19726 | 1.0x | 28 | remuxed (same size) |
| 25 | 3840x2160 | .mov | 126.48 | 37891 | .mp4 | 126.48 | 37571 | 1.0x | 28 | remuxed (same size) |
| 26 | 640x360 | .mp4 | 0.55 | 354 | .mp4 | 0.55 | 341 | 1.0x | 13 | remuxed (same size) |
| 27 | 1280x720 | .mp4 | 16.63 | 4982 | .mp4 | 16.63 | 4937 | 1.0x | 28 | remuxed (same size) |
| 28 | 1920x1080 | .mp4 | 36.48 | 10928 | .mp4 | 36.48 | 10834 | 1.0x | 28 | remuxed (same size) |
| 29 | 2560x1440 | .mp4 | 66.41 | 19895 | .mp4 | 66.41 | 19726 | 1.0x | 28 | remuxed (same size) |
| 30 | 3840x2160 | .mp4 | 126.48 | 37891 | .mp4 | 126.48 | 37571 | 1.0x | 28 | remuxed (same size) |
| 31 | 640x360 | .mpeg | 0.54 | 349 | .mp4 | 0.87 | 546 | 1.6x | 13 | re-encoded, larger |
| 32 | 1280x720 | .mpeg | 5.72 | 1713 | .mp4 | 18.69 | 5550 | 3.3x | 28 | re-encoded, larger |
| 33 | 1920x1080 | .mpeg | 13.03 | 3905 | .mp4 | 42.59 | 12652 | 3.3x | 28 | re-encoded, larger |
| 34 | 2560x1440 | .mpeg | 21.58 | 6466 | .mp4 | 71.2 | 21150 | 3.3x | 28 | re-encoded, larger |
| 35 | 3840x2160 | .mpeg | 44.62 | 13369 | .mp4 | 133.53 | 39667 | 3.0x | 28 | re-encoded, larger |
| 36 | 640x360 | .mpg | 0.52 | 338 | .mp4 | 0.76 | 474 | 1.5x | 13 | re-encoded, larger |
| 37 | 1280x720 | .mpg | 5.88 | 1761 | .mp4 | 18.8 | 5583 | 3.2x | 28 | re-encoded, larger |
| 38 | 1920x1080 | .mpg | 13.26 | 3971 | .mp4 | 42.75 | 12701 | 3.2x | 28 | re-encoded, larger |
| 39 | 2560x1440 | .mpg | 21.84 | 6544 | .mp4 | 71.55 | 21254 | 3.3x | 28 | re-encoded, larger |
| 40 | 3840x2160 | .mpg | 44.98 | 13475 | .mp4 | 134.23 | 39876 | 3.0x | 28 | re-encoded, larger |
| 41 | 640x360 | .vob | 0.53 | 344 | .mp4 | 0.76 | 474 | 1.4x | 13 | re-encoded, larger |
| 42 | 1280x720 | .vob | 5.96 | 1785 | .mp4 | 18.8 | 5583 | 3.2x | 28 | re-encoded, larger |
| 43 | 1920x1080 | .vob | 13.42 | 4022 | .mp4 | 42.75 | 12701 | 3.2x | 28 | re-encoded, larger |
| 44 | 2560x1440 | .vob | 22.12 | 6626 | .mp4 | 71.55 | 21254 | 3.2x | 28 | re-encoded, larger |
| 45 | 3840x2160 | .vob | 45.53 | 13640 | .mp4 | 134.23 | 39876 | 2.9x | 28 | re-encoded, larger |
| 46 | 640x360 | .webm | 0.36 | 235 | .mp4 | 0.7 | 435 | 1.9x | 13 | re-encoded, larger |
| 47 | 1280x720 | .webm | 0.98 | 295 | .mp4 | 10.02 | 2974 | 10.2x | 28 | re-encoded, INFLATED |
| 48 | 1920x1080 | .webm | 1.72 | 515 | .mp4 | 22.72 | 6747 | 13.2x | 28 | re-encoded, INFLATED |
| 49 | 2560x1440 | .webm | 2.76 | 825 | .mp4 | 41.3 | 12266 | 15.0x | 28 | re-encoded, INFLATED |
| 50 | 3840x2160 | .webm | 5.54 | 1659 | .mp4 | 94.1 | 27953 | 17.0x | 28 | re-encoded, INFLATED |
| 51 | 640x360 | .wmv | 0.55 | 357 | .mp4 | 0.97 | 609 | 1.8x | 13 | re-encoded, larger |
| 52 | 1280x720 | .wmv | 4.03 | 1206 | .mp4 | 15.23 | 4524 | 3.8x | 28 | re-encoded, larger |
| 53 | 1920x1080 | .wmv | 9.02 | 2701 | .mp4 | 34.38 | 10212 | 3.8x | 28 | re-encoded, larger |
| 54 | 2560x1440 | .wmv | 15.06 | 4511 | .mp4 | 57.39 | 17048 | 3.8x | 28 | re-encoded, larger |
| 55 | 3840x2160 | .wmv | 31.96 | 9575 | .mp4 | 109.3 | 32471 | 3.4x | 28 | re-encoded, larger |