Synthetic one-second 64×64 yellow clips with no audio, created for codec
regressions. They contain no portfolio/user content. Tests read the fixtures;
FFmpeg is not a test dependency.

Generation commands (FFmpeg 7.1.5; x264/x265 encoders):

```sh
ffmpeg -f lavfi -i color=c=yellow:s=64x64:r=10:d=1 -c:v libx264 -threads 1 -pix_fmt yuv420p -movflags +faststart h264.mp4
ffmpeg -f lavfi -i color=c=yellow:s=64x64:r=10:d=1 -c:v libx265 -threads 1 -x265-params pools=1:log-level=error -tag:v hvc1 -pix_fmt yuv420p -movflags +faststart hevc.mp4
```
