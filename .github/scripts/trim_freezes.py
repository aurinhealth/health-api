"""Shortens the still stretches of an app clip (app-videos.yml).

XCUITest on CI can wait seconds before a swipe or a tap, and the recording
films the screen standing still all that time. Every freeze longer than HOLD
seconds is cut down to HOLD; shorter ones (a rest timer ticking once a second)
stay as they are.

    python3 trim_freezes.py in.mp4 out.mp4
"""
import re
import subprocess
import sys

HOLD = 1.2

src, dst = sys.argv[1], sys.argv[2]
probe = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", src, "-vf", f"freezedetect=n=0.002:d={HOLD}", "-an", "-f", "null", "-"],
    capture_output=True, text=True,
).stderr
starts = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", probe)]
ends = [float(x) for x in re.findall(r"freeze_end: ([\d.]+)", probe)]
duration = float(re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe).group(3)) + 60 * float(
    re.search(r"Duration: (\d+):(\d+)", probe).group(2))
ends += [duration] * (len(starts) - len(ends))
# Drop each freeze after its first HOLD seconds.
cuts = [(s + HOLD, e) for s, e in zip(starts, ends) if e - s > HOLD]
keep = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in cuts) or "0"
subprocess.run(
    ["ffmpeg", "-loglevel", "error", "-y", "-i", src,
     "-vf", f"select='not({keep})',setpts=N/30/TB,fps=30",
     "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", dst],
    check=True,
)
print(f"{src}: {len(cuts)} still stretches cut")
