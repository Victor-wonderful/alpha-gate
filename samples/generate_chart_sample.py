"""Generate a sample mockup of the Alpha Gate analysis chart visualization."""
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D
import os

# Korean font (Windows: Malgun Gothic)
matplotlib.rcParams["font.family"] = ["Malgun Gothic", "DejaVu Sans"]
matplotlib.rcParams["axes.unicode_minus"] = False

# ---- Theme (matches our Tailwind tokens) ----
BG       = "#0a0a0e"
PANEL    = "#0f0f15"
GRID     = "#2a2a35"
TEXT     = "#a1a1aa"
TEXT_HI  = "#f5f5f7"
GREEN    = "#22c55e"   # grade-a
RED      = "#ef4444"   # grade-d
BLUE     = "#0ea5e9"   # grade-b
ORANGE   = "#f59e0b"   # grade-c
GREY     = "#6b7280"

# ---- Mock 4H BTC candles (80 bars) ----
np.random.seed(7)
n = 80
trend = np.cumsum(np.random.normal(8, 60, n))
base = 42000 + trend
open_ = base + np.random.normal(0, 60, n)
close = base + np.random.normal(0, 60, n)
high  = np.maximum(open_, close) + np.abs(np.random.normal(80, 50, n))
low   = np.minimum(open_, close) - np.abs(np.random.normal(80, 50, n))

# Inject a sweep + recovery shape near the end
sweep_idx = n - 10
low[sweep_idx]   = 42400
close[sweep_idx] = 42620
open_[sweep_idx] = 42800
high[sweep_idx]  = 42900
for i in range(sweep_idx + 1, n):
    close[i] = close[i - 1] + np.random.normal(40, 25)
    open_[i] = close[i - 1] + np.random.normal(0, 20)
    high[i]  = max(open_[i], close[i]) + abs(np.random.normal(50, 30))
    low[i]   = min(open_[i], close[i]) - abs(np.random.normal(50, 30))

# Levels (made-up but consistent with the candle range)
last_swing_high = float(np.max(high[-60:-20])) + 100
last_swing_low  = 42400.0
poc             = 43050.0
vah             = 43400.0
val             = 42700.0
entry_low       = 42500.0
entry_high      = 42700.0
entry_mid       = (entry_low + entry_high) / 2
stop            = 42300.0
target          = 43800.0

# ---- Plot ----
fig, ax = plt.subplots(figsize=(14, 6.5), facecolor=BG, dpi=110)
ax.set_facecolor(PANEL)

# Grid
ax.grid(True, color=GRID, linewidth=0.5, alpha=0.7)
for spine in ax.spines.values():
    spine.set_color(GRID)

# Candlesticks
width = 0.6
for i in range(n):
    color = GREEN if close[i] >= open_[i] else RED
    # Wick
    ax.plot([i, i], [low[i], high[i]], color=color, linewidth=1.0, solid_capstyle="butt")
    # Body
    body_low = min(open_[i], close[i])
    body_high = max(open_[i], close[i])
    body_height = max(body_high - body_low, 4)
    rect = mpatches.Rectangle((i - width / 2, body_low), width, body_height,
                              facecolor=color, edgecolor=color, linewidth=0)
    ax.add_patch(rect)

# Value Area shaded band (VAL - VAH)
ax.axhspan(val, vah, facecolor=ORANGE, alpha=0.06)

# Entry zone shaded band
ax.axhspan(entry_low, entry_high, facecolor=BLUE, alpha=0.10)

# Horizontal levels
def hline(y, color, label, style="solid", weight=1.6):
    ax.axhline(y=y, color=color, linewidth=weight, linestyle=style, alpha=0.95)
    # Right-side label tag
    ax.text(n + 0.5, y, f" {label}  ${y:,.0f}",
            color=TEXT_HI, fontsize=9, va="center", ha="left",
            bbox=dict(facecolor=color, edgecolor="none", pad=2.2, alpha=0.95))

hline(last_swing_high, GREY,   "직전 스윙 고점", style=(0, (5, 4)))
hline(last_swing_low,  GREY,   "직전 스윙 저점", style=(0, (5, 4)))
hline(poc,             ORANGE, "POC",            style=(0, (1, 3)))
hline(vah,             ORANGE, "VAH",            style=(0, (1, 3)))
hline(val,             ORANGE, "VAL",            style=(0, (1, 3)))
hline(entry_high,      BLUE,   "진입 상단",       style=(0, (5, 3)))
hline(entry_low,       BLUE,   "진입 하단",       style=(0, (5, 3)))
hline(entry_mid,       BLUE,   "진입 중간",       weight=2.0)
hline(stop,            RED,    "손절",            weight=2.2)
hline(target,          GREEN,  "목표",            weight=2.2)

# Trigger marker arrow at sweep
ax.annotate("",
            xy=(sweep_idx, low[sweep_idx] - 80),
            xytext=(sweep_idx, low[sweep_idx] - 400),
            arrowprops=dict(arrowstyle="->", color=BLUE, lw=1.6))
ax.text(sweep_idx, low[sweep_idx] - 480, "트리거\nsweep",
        color=BLUE, fontsize=9, ha="center", va="top")

# Cosmetics
ax.set_xlim(-1, n + 11)
ax.set_ylim(min(low) - 600, max(high) + 400)
ax.set_xticks([])
ax.tick_params(axis="y", colors=TEXT, labelsize=9)
ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x:,.0f}"))

# Title block (mimics our card header)
fig.text(0.04, 0.95, "차트 시각화 · 4H",
         color=TEXT_HI, fontsize=14, weight="bold")
fig.text(0.04, 0.918, "BTCUSDT · 시나리오 A: 4H 스윙 저점 sweep 후 반등",
         color=TEXT, fontsize=10)

# Scenario chip
fig.text(0.78, 0.945, "  시나리오 A · 롱  ",
         color="white", fontsize=9, weight="bold",
         bbox=dict(facecolor=BLUE, edgecolor="none", pad=4))

# Legend bottom
legend_handles = [
    Line2D([0], [0], color=BLUE,   lw=2.5, label="진입 영역"),
    Line2D([0], [0], color=RED,    lw=2.5, label="손절"),
    Line2D([0], [0], color=GREEN,  lw=2.5, label="목표"),
    Line2D([0], [0], color=ORANGE, lw=2,   linestyle=(0, (1, 3)), label="Volume Profile (POC/VAH/VAL)"),
    Line2D([0], [0], color=GREY,   lw=2,   linestyle=(0, (5, 4)), label="직전 스윙 고/저"),
]
leg = ax.legend(handles=legend_handles, loc="lower left",
                facecolor=PANEL, edgecolor=GRID, labelcolor=TEXT,
                fontsize=8.5, framealpha=0.95, ncol=5,
                bbox_to_anchor=(0, -0.12))

plt.tight_layout(rect=(0, 0.02, 1, 0.92))

out_path = os.path.join(os.path.dirname(__file__), "chart_sample.png")
plt.savefig(out_path, facecolor=BG, dpi=130, bbox_inches="tight")
print(out_path)
