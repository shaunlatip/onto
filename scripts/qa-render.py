#!/usr/bin/env python3
"""Render /tmp/qa.geojson as a before/after grid PNG for visual QA."""
import json, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPoly
from matplotlib.collections import PatchCollection

src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/qa.geojson"
out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/qa.png"

fc = json.load(open(src))
# group by label
groups = {}
for f in fc["features"]:
    p = f["properties"]
    groups.setdefault((p["order"], p["label"]), {})[p["stage"]] = f["geometry"]
keys = sorted(groups.keys())

def polys(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]

stages = ["before", "after"]
n = len(keys)
fig, axes = plt.subplots(n, 2, figsize=(8, 3.4 * n))
if n == 1:
    axes = [axes]

for row, key in enumerate(keys):
    order, label = key
    for col, stage in enumerate(stages):
        ax = axes[row][col]
        geom = groups[key].get(stage)
        ax.set_title(f"{label}\n{stage}", fontsize=9)
        ax.set_aspect("equal")
        ax.axis("off")
        if not geom:
            ax.text(0.5, 0.5, "(empty)", ha="center", va="center", transform=ax.transAxes)
            continue
        patches = []
        for poly in polys(geom):
            outer = poly[0]
            patches.append(MplPoly(outer, closed=True))
        pc = PatchCollection(patches, facecolor="#f5a623", edgecolor="#d98209",
                             alpha=0.5, linewidths=0.6)
        ax.add_collection(pc)
        xs = [pt[0] for poly in polys(geom) for pt in poly[0]]
        ys = [pt[1] for poly in polys(geom) for pt in poly[0]]
        mx = (max(xs) - min(xs)) * 0.05 + 1e-6
        my = (max(ys) - min(ys)) * 0.05 + 1e-6
        ax.set_xlim(min(xs) - mx, max(xs) + mx)
        ax.set_ylim(min(ys) - my, max(ys) + my)

plt.tight_layout()
plt.savefig(out, dpi=110, bbox_inches="tight")
print("wrote", out)
