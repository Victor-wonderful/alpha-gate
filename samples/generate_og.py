"""Generate Open Graph image for Alpha Gate."""
import os
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import LinearSegmentedColormap
import numpy as np

matplotlib.rcParams["font.family"] = ["Malgun Gothic", "DejaVu Sans"]
matplotlib.rcParams["axes.unicode_minus"] = False

W, H = 1200, 630
DPI = 100

BG       = "#070a0f"
PANEL    = "#0c1118"
TEXT_HI  = "#f5f7fa"
TEXT_MD  = "#9aa3b2"
TEXT_LO  = "#5b6573"
BLUE_HI  = "#3fb8f7"
BLUE_MID = "#1f86e8"
BLUE_LO  = "#1c4eb8"
GREEN    = "#22c55e"
RED      = "#ef4444"
ORANGE   = "#f59e0b"

fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor=BG)
ax = fig.add_axes((0, 0, 1, 1))
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis("off")
ax.set_facecolor(BG)

# Top-right radial glow
glow = mpatches.Circle((W * 0.85, H * 1.05), radius=380,
                       facecolor=BLUE_MID, alpha=0.18, edgecolor="none")
ax.add_patch(glow)
glow2 = mpatches.Circle((W * 0.85, H * 1.05), radius=240,
                        facecolor=BLUE_HI, alpha=0.12, edgecolor="none")
ax.add_patch(glow2)

# Subtle grid (left side decorative)
for x in range(60, 500, 56):
    ax.plot([x, x], [40, 120], color=TEXT_LO, alpha=0.18, lw=0.7)

# Logo (two-chevron mark) — placed top-left
def chevron(cx, cy, size, color, alpha=1.0):
    s = size
    pts = [
        (cx,        cy + s * 0.45),
        (cx + s * 0.42, cy - s * 0.45),
        (cx,        cy - s * 0.30),
        (cx - s * 0.42, cy - s * 0.45),
    ]
    poly = mpatches.Polygon(pts, closed=True, facecolor=color, edgecolor="none", alpha=alpha)
    ax.add_patch(poly)

LOGO_CX = 100
LOGO_CY = H - 100
LOGO_S  = 80
chevron(LOGO_CX, LOGO_CY - 40, LOGO_S, BLUE_LO, alpha=0.45)
chevron(LOGO_CX, LOGO_CY,      LOGO_S, BLUE_HI)

# Wordmark next to logo
fig.text(LOGO_CX / W + 0.08, (LOGO_CY + 12) / H, "Alpha Gate",
         color=TEXT_HI, fontsize=28, weight="bold",
         ha="left", va="center", transform=fig.transFigure)
fig.text(LOGO_CX / W + 0.08, (LOGO_CY - 22) / H, "ALPHAGATE.IO",
         color=TEXT_LO, fontsize=10.5, weight="bold",
         ha="left", va="center", transform=fig.transFigure)

# Hero copy — large headline
fig.text(0.062, 0.55, "진입 버튼을 누르기 전에",
         color=TEXT_MD, fontsize=24, ha="left", va="center", transform=fig.transFigure)
fig.text(0.062, 0.43, "이 거래를 해도 되는가",
         color=TEXT_HI, fontsize=58, weight="bold", ha="left", va="center",
         transform=fig.transFigure)

# Accent underline under headline
ax.add_patch(mpatches.Rectangle((75, H * 0.32), 140, 5,
                                facecolor=BLUE_HI, edgecolor="none"))

# Sub-copy
fig.text(0.062, 0.235,
         "AI 시장 분석  ·  매매 등급 평가  ·  거래 저널  ·  AI 복기",
         color=TEXT_MD, fontsize=18, ha="left", va="center",
         transform=fig.transFigure)

# Right-side decorative — fake candle chart
chart_x = 750
chart_y = 130
chart_w = 390
chart_h = 370

# Chart background panel
ax.add_patch(mpatches.FancyBboxPatch(
    (chart_x, chart_y), chart_w, chart_h,
    boxstyle="round,pad=0,rounding_size=14",
    facecolor=PANEL, edgecolor="#1a2230", linewidth=1.5
))

# Generate fake candles
rng = np.random.default_rng(11)
n_candles = 30
prices = 100 + np.cumsum(rng.normal(0.4, 1.6, n_candles))
opens  = prices + rng.normal(0, 0.7, n_candles)
closes = prices + rng.normal(0, 0.7, n_candles)
highs  = np.maximum(opens, closes) + np.abs(rng.normal(0.9, 0.6, n_candles))
lows   = np.minimum(opens, closes) - np.abs(rng.normal(0.9, 0.6, n_candles))

# Scale into chart area
y_min, y_max = lows.min(), highs.max()
y_pad = (y_max - y_min) * 0.1
y_min -= y_pad
y_max += y_pad
inner_pad = 32
def yscale(v):
    return chart_y + inner_pad + (v - y_min) / (y_max - y_min) * (chart_h - 2 * inner_pad)

bar_area_x = chart_x + 24
bar_area_w = chart_w - 48
bar_w = bar_area_w / n_candles * 0.6

for i in range(n_candles):
    cx = bar_area_x + (bar_area_w / n_candles) * (i + 0.5)
    o, c, h, l = opens[i], closes[i], highs[i], lows[i]
    color = GREEN if c >= o else RED
    # Wick
    ax.plot([cx, cx], [yscale(l), yscale(h)], color=color, lw=1.2, solid_capstyle="butt")
    # Body
    body_low = min(o, c)
    body_h = max(abs(c - o), 0.3)
    rect = mpatches.Rectangle((cx - bar_w / 2, yscale(body_low)),
                              bar_w, yscale(body_low + body_h) - yscale(body_low),
                              facecolor=color, edgecolor="none")
    ax.add_patch(rect)

# Overlay entry/stop/target lines
entry_y  = yscale(prices.mean() + 1.2)
stop_y   = yscale(lows.min() + 0.5)
target_y = yscale(highs.max() - 0.5)

ax.plot([chart_x + 24, chart_x + chart_w - 24], [entry_y, entry_y],
        color=BLUE_HI, lw=2.5, linestyle="-")
ax.plot([chart_x + 24, chart_x + chart_w - 24], [stop_y, stop_y],
        color=RED, lw=2, linestyle="--")
ax.plot([chart_x + 24, chart_x + chart_w - 24], [target_y, target_y],
        color=GREEN, lw=2, linestyle="--")

# Mini "A grade" badge
ax.add_patch(mpatches.FancyBboxPatch(
    (chart_x + 20, chart_y + chart_h - 50),
    78, 30, boxstyle="round,pad=0,rounding_size=6",
    facecolor=GREEN, alpha=0.15, edgecolor=GREEN, linewidth=1
))
fig.text((chart_x + 59) / W, (chart_y + chart_h - 35) / H, "A · 진입 가능",
         color=GREEN, fontsize=11, weight="bold",
         ha="center", va="center", transform=fig.transFigure)

# Footer
fig.text(0.062, 0.06,
         "alphagate.io",
         color=TEXT_LO, fontsize=12, weight="bold",
         ha="left", va="center", transform=fig.transFigure)
fig.text(0.50, 0.06,
         "Powered by Binance Futures · Claude AI",
         color=TEXT_LO, fontsize=11, ha="left", va="center", transform=fig.transFigure)

out_path = os.path.join(os.path.dirname(__file__), "..", "src", "app", "opengraph-image.png")
out_path = os.path.normpath(out_path)
plt.savefig(out_path, facecolor=BG, dpi=DPI, bbox_inches=None)
plt.close(fig)
print(out_path)
