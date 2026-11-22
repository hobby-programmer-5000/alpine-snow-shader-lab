"""
Bake real AWS Open Data / Mapzen Terrarium DEM elevation tiles for Korean alpine peaks:
  1. Hallasan (한라산 백록담, Jeju Island — 33.3617 N, 126.5292 E, ~1947 m)
  2. Seoraksan (설악산 대청봉 & 공룡능선, Gangwon — 38.1195 N, 128.4655 E, ~1708 m)

Outputs into public/dem/:
  - <id>_dem.png     (512x512 RGBA lossless PNG: RG = 16-bit height [0..2200m], B = Sky-View AO, A = 255)
  - <id>_horizon.png (512x512 RGBA lossless PNG: R = East(+X), G = South(+Z), B = West(-X) sin(horizonAngle), A = 255)
  - dem_manifest.json (verified elevations, span, optimal drop-in line & fall-line waypoints)

Attribution: Terrain DEM from AWS Open Data / Mapzen Terrarium.
"""

import json
import math
import os
import urllib.request
from io import BytesIO
import numpy as np
from PIL import Image

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "dem")
os.makedirs(OUT_DIR, exist_ok=True)

TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ZOOM = 13
GRID_SIZE = 512
SPAN_METERS = 4096.0
MAX_ELEV = 2200.0


def latlon_to_tile_float(lat_deg: float, lon_deg: float, zoom: int):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xt = (lon_deg + 180.0) / 360.0 * n
    yt = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return xt, yt


def fetch_terrarium_tile(z: int, x: int, y: int) -> np.ndarray:
    url = TERRARIUM_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={"User-Agent": "AlpineSnowShaderLab/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        img = Image.open(BytesIO(resp.read())).convert("RGB")
    arr = np.asarray(img, dtype=np.float32)
    # Mapzen Terrarium formula: elevation_m = (R * 256 + G + B / 256) - 32768
    elev = (arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0) - 32768.0
    return elev


def fetch_elevation_patch(center_lat: float, center_lon: float, span_m: float, out_size: int) -> np.ndarray:
    cx_f, cy_f = latlon_to_tile_float(center_lat, center_lon, ZOOM)
    cx_i, cy_i = int(math.floor(cx_f)), int(math.floor(cy_f))

    # Meters per pixel in Web Mercator at center_lat
    meters_per_tile = 40075016.686 * math.cos(math.radians(center_lat)) / (2.0 ** ZOOM)
    meters_per_px = meters_per_tile / 256.0

    # Stitch 3x3 tiles centered on (cx_i, cy_i) -> 768x768 native elevation grid
    stitch = np.zeros((256 * 3, 256 * 3), dtype=np.float32)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            tile = fetch_terrarium_tile(ZOOM, cx_i + dx, cy_i + dy)
            y0 = (dy + 1) * 256
            x0 = (dx + 1) * 256
            stitch[y0:y0 + 256, x0:x0 + 256] = tile

    # Center pixel inside 768x768 stitched array
    px_center_x = (1.0 + (cx_f - cx_i)) * 256.0
    px_center_y = (1.0 + (cy_f - cy_i)) * 256.0
    half_px = (span_m * 0.5) / meters_per_px

    # Bilinear/bicubic crop to exact span_m x span_m at out_size x out_size
    x0 = px_center_x - half_px
    y0 = px_center_y - half_px
    x1 = px_center_x + half_px
    y1 = px_center_y + half_px

    pil_f = Image.fromarray(stitch, mode="F")
    cropped = pil_f.crop((x0, y0, x1, y1)).resize((out_size, out_size), Image.Resampling.BICUBIC)
    elev = np.asarray(cropped, dtype=np.float32)

    # Light gentle 3x3 smoothing pass to remove quantization stair-steps from SRTM/EU-DEM
    padded = np.pad(elev, 1, mode="edge")
    smooth = (
        padded[1:-1, 1:-1] * 4.0 +
        (padded[:-2, 1:-1] + padded[2:, 1:-1] + padded[1:-1, :-2] + padded[1:-1, 2:]) * 2.0 +
        (padded[:-2, :-2] + padded[:-2, 2:] + padded[2:, :-2] + padded[2:, 2:]) * 1.0
    ) / 16.0
    return np.clip(smooth, 0.0, MAX_ELEV - 1.0)


def compute_horizon_and_ao(elev: np.ndarray, span_m: float):
    """
    Compute Max (1988) horizon elevation angles in 3 northern-hemisphere solar directions
    (+X East, +Z South, -X West) + 8-direction Topographic Sky-View Ambient Occlusion.
    Note: Array row y corresponds to World +Z (South), col x corresponds to World +X (East).
    """
    h, w = elev.shape
    px_m = span_m / w

    def march_max_sin_angle(dx: int, dy: int, max_steps: int = 72) -> np.ndarray:
        max_slope = np.zeros_like(elev, dtype=np.float32)
        step_dist = math.hypot(dx, dy) * px_m
        for s in range(1, max_steps + 1):
            # Exponential-ish acceleration for distant ridge horizons
            jump = s if s <= 24 else 24 + (s - 24) * 2
            ox = dx * jump
            oy = dy * jump
            dist = jump * step_dist
            # Shift elevation grid safely
            y_src_start = max(0, oy)
            y_src_end = min(h, h + oy)
            x_src_start = max(0, ox)
            x_src_end = min(w, w + ox)

            y_dst_start = max(0, -oy)
            y_dst_end = min(h, h - oy)
            x_dst_start = max(0, -ox)
            x_dst_end = min(w, w - ox)

            if y_src_start >= y_src_end or x_src_start >= x_src_end:
                break

            dh = elev[y_src_start:y_src_end, x_src_start:x_src_end] - elev[y_dst_start:y_dst_end, x_dst_start:x_dst_end]
            slope = dh / dist
            sub = max_slope[y_dst_start:y_dst_end, x_dst_start:x_dst_end]
            np.maximum(sub, slope, out=sub)

        # sin(atan(slope)) = slope / sqrt(1 + slope^2)
        return max_slope / np.sqrt(1.0 + max_slope * max_slope)

    hor_e = march_max_sin_angle(1, 0)
    hor_s = march_max_sin_angle(0, 1)
    hor_w = march_max_sin_angle(-1, 0)
    hor_n = march_max_sin_angle(0, -1)
    hor_ne = march_max_sin_angle(1, -1, 48)
    hor_se = march_max_sin_angle(1, 1, 48)
    hor_sw = march_max_sin_angle(-1, 1, 48)
    hor_nw = march_max_sin_angle(-1, -1, 48)

    mean_sin = (hor_e + hor_s + hor_w + hor_n + hor_ne + hor_se + hor_sw + hor_nw) / 8.0
    ao = np.clip(1.0 - mean_sin * 1.15, 0.15, 1.0)
    return hor_e, hor_s, hor_w, ao


def trace_skiable_fall_line(elev: np.ndarray, span_m: float, start_offset_px=(0, 0)):
    """
    Find a great skiable upper-mountain drop-in point (14-25 deg pitch near summit)
    and trace a natural 650m downhill fall-line spline for AUTO CARVE mode!
    """
    h, w = elev.shape
    px_m = span_m / w
    gy, gx = np.gradient(elev, px_m)
    slope_mag = np.hypot(gx, gy)

    # Locate summit peak inside central 50%
    q = w // 4
    sub = elev[q:w - q, q:w - q]
    peak_idx = np.unravel_index(np.argmax(sub), sub.shape)
    peak_y, peak_x = peak_idx[0] + q, peak_idx[1] + q
    peak_elev = float(elev[peak_y, peak_x])

    # Search ring 160m..460m around summit for ideal skiable 15-24 deg pitch with long open runout
    best_score = -1e9
    best_pt = (peak_x + start_offset_px[0], peak_y + start_offset_px[1])

    for rad_px in range(22, 62, 4):
        for deg in range(0, 360, 12):
            ang = math.radians(deg)
            cx = int(round(peak_x + math.cos(ang) * rad_px))
            cz = int(round(peak_y + math.sin(ang) * rad_px))
            if cx < 80 or cx > w - 80 or cz < 80 or cz > h - 80:
                continue
            s = float(slope_mag[cz, cx])
            # Ideal ski slope ~0.27..0.44 (15..24 deg)
            if s < 0.22 or s > 0.52:
                continue
            # Simulate 450m steepest-descent rollout to verify sustained skiable terrain
            tx, tz = float(cx), float(cz)
            ok_steps = 0
            total_drop = 0.0
            for _ in range(45):
                ix, iz = int(round(tx)), int(round(tz))
                if ix < 32 or ix >= w - 32 or iz < 32 or iz >= h - 32:
                    break
                dx_g = float(gx[iz, ix])
                dz_g = float(gy[iz, ix])
                gmag = math.hypot(dx_g, dz_g)
                if gmag < 0.14 or gmag > 0.68:
                    break
                # Step 10m downhill (-grad)
                tx -= (dx_g / gmag) * (10.0 / px_m)
                tz -= (dz_g / gmag) * (10.0 / px_m)
                ok_steps += 1
            end_elev = float(elev[int(round(tz)), int(round(tx))])
            total_drop = float(elev[cz, cx]) - end_elev
            score = ok_steps * 20.0 + total_drop * 1.5 + float(elev[cz, cx]) * 0.25 - abs(s - 0.32) * 300.0
            if score > best_score:
                best_score = score
                best_pt = (cx, cz)

    # Trace smooth 550m fall-line waypoints (in world meters centered at 0,0)
    tx, tz = float(best_pt[0]), float(best_pt[1])
    waypoints = []
    vel_x, vel_z = 0.0, 0.0
    for _ in range(60):
        wx = (tx / w - 0.5) * span_m
        wz = (tz / h - 0.5) * span_m
        waypoints.append([round(wx, 2), round(wz, 2)])
        ix, iz = max(2, min(w - 3, int(round(tx)))), max(2, min(h - 3, int(round(tz))))
        dx_g = float(gx[iz, ix])
        dz_g = float(gy[iz, ix])
        gmag = math.hypot(dx_g, dz_g) + 1e-5
        # Smooth momentum downhill direction
        dir_x = -dx_g / gmag
        dir_z = -dz_g / gmag
        vel_x = vel_x * 0.55 + dir_x * 0.45
        vel_z = vel_z * 0.55 + dir_z * 0.45
        vmag = math.hypot(vel_x, vel_z) + 1e-5
        tx += (vel_x / vmag) * (9.5 / px_m)
        tz += (vel_z / vmag) * (9.5 / px_m)

    peak_world_x = round((peak_x / w - 0.5) * span_m, 1)
    peak_world_z = round((peak_y / h - 0.5) * span_m, 1)
    return {
        "peakElevM": round(peak_elev, 1),
        "peakWorldXZ": [peak_world_x, peak_world_z],
        "startElevM": round(float(elev[best_pt[1], best_pt[0]]), 1),
        "fallLineWaypoints": waypoints
    }


def bake_mountain(mid: str, label: str, ko_name: str, lat: float, lon: float):
    print(f"Fetching Mapzen Terrarium Z{ZOOM} tiles for {label} ({lat}, {lon})...")
    elev = fetch_elevation_patch(lat, lon, SPAN_METERS, GRID_SIZE)
    min_e, max_e = float(elev.min()), float(elev.max())
    print(f"  -> {label}: min={min_e:.1f}m, max={max_e:.1f}m")

    hor_e, hor_s, hor_w, ao = compute_horizon_and_ao(elev, SPAN_METERS)
    line_info = trace_skiable_fall_line(elev, SPAN_METERS)
    print(f"  -> Peak {line_info['peakElevM']}m at {line_info['peakWorldXZ']}, drop-in at {line_info['startElevM']}m ({len(line_info['fallLineWaypoints'])} pts)")

    # Pack 16-bit RG elevation + B AO + A=255 (strictly opaque to prevent premultiplied alpha corruption!)
    elev16 = np.clip(np.round((elev / MAX_ELEV) * 65535.0), 0, 65535).astype(np.uint16)
    r_hi = (elev16 >> 8).astype(np.uint8)
    g_lo = (elev16 & 0xFF).astype(np.uint8)
    b_ao = np.clip(np.round(ao * 255.0), 0, 255).astype(np.uint8)
    a_full = np.full_like(r_hi, 255, dtype=np.uint8)

    dem_rgba = np.stack([r_hi, g_lo, b_ao, a_full], axis=-1)
    dem_path = os.path.join(OUT_DIR, f"{mid}_dem.png")
    Image.fromarray(dem_rgba, mode="RGBA").save(dem_path, optimize=True)

    hor_rgba = np.stack([
        np.clip(np.round(hor_e * 255.0), 0, 255).astype(np.uint8),
        np.clip(np.round(hor_s * 255.0), 0, 255).astype(np.uint8),
        np.clip(np.round(hor_w * 255.0), 0, 255).astype(np.uint8),
        a_full
    ], axis=-1)
    hor_path = os.path.join(OUT_DIR, f"{mid}_horizon.png")
    Image.fromarray(hor_rgba, mode="RGBA").save(hor_path, optimize=True)

    return {
        "id": mid,
        "label": label,
        "koName": ko_name,
        "lat": lat,
        "lon": lon,
        "gridSize": GRID_SIZE,
        "spanMeters": SPAN_METERS,
        "maxElev": MAX_ELEV,
        "minElevObserved": round(min_e, 1),
        "maxElevObserved": round(max_e, 1),
        "demUrl": f"/dem/{mid}_dem.png",
        "horizonUrl": f"/dem/{mid}_horizon.png",
        **line_info
    }


def main():
    manifest = {
        "attribution": "AWS Open Data / Mapzen Terrarium (USGS SRTM & GMTED2010)",
        "mountains": {}
    }
    manifest["mountains"]["hallasan"] = bake_mountain(
        "hallasan", "HALLASAN · 한라산", "한라산 백록담 (1,947m)", 33.3617, 126.5292
    )
    manifest["mountains"]["seoraksan"] = bake_mountain(
        "seoraksan", "SEORAKSAN · 설악산", "설악산 대청봉 (1,708m)", 38.1195, 128.4655
    )

    manifest_path = os.path.join(OUT_DIR, "dem_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"Saved manifest to {manifest_path}")


if __name__ == "__main__":
    main()
