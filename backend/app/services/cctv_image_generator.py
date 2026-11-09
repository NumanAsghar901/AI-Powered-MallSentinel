"""Generates 30 realistic, high-fidelity YOLO-annotated CCTV evidence images
and seeds the cctv_evidence database table.
"""

import math
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.models import (
    CctvEvidence,
    Department,
    EvidenceReviewStatus,
    PenaltySeverity,
    User,
    UserRole,
)

STORAGE_DIR = Path(settings.EVIDENCE_DIR)
FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def get_font(path: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if os.path.exists(path):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


def draw_yolo_box(
    draw: ImageDraw.ImageDraw,
    box: list[int],
    label: str,
    confidence: float,
    color: tuple[int, int, int],
    text_color: tuple[int, int, int] = (255, 255, 255),
    tag_bg_color: tuple[int, int, int] | None = None,
    font: Any = None,
    tag_font: Any = None,
) -> None:
    x1, y1, x2, y2 = box
    tag_bg = tag_bg_color or color

    # Draw main bounding box (3px thickness)
    for offset in range(3):
        draw.rectangle([x1 - offset, y1 - offset, x2 + offset, y2 + offset], outline=color)

    # Draw corner bracket accents (5px thickness, 16px length)
    bracket_len = min(20, (x2 - x1) // 3, (y2 - y1) // 3)
    bracket_w = 4
    # Top-left
    draw.line([(x1, y1), (x1 + bracket_len, y1)], fill=color, width=bracket_w)
    draw.line([(x1, y1), (x1, y1 + bracket_len)], fill=color, width=bracket_w)
    # Top-right
    draw.line([(x2, y1), (x2 - bracket_len, y1)], fill=color, width=bracket_w)
    draw.line([(x2, y1), (x2, y1 + bracket_len)], fill=color, width=bracket_w)
    # Bottom-left
    draw.line([(x1, y2), (x1 + bracket_len, y2)], fill=color, width=bracket_w)
    draw.line([(x1, y2), (x1, y1 - bracket_len)], fill=color, width=bracket_w)
    # Bottom-right
    draw.line([(x2, y2), (x2 - bracket_len, y2)], fill=color, width=bracket_w)
    draw.line([(x2, y2), (x2, y2 - bracket_len)], fill=color, width=bracket_w)

    # YOLO Tag badge
    text = f"{label} {confidence:.2f}"
    f = tag_font or font
    
    # Calculate text bbox
    try:
        bbox = f.getbbox(text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
    except Exception:
        tw = len(text) * 8
        th = 14

    pad_x, pad_y = 6, 4
    tag_x1 = x1
    tag_y1 = max(0, y1 - th - (pad_y * 2) - 2)
    tag_x2 = tag_x1 + tw + (pad_x * 2)
    tag_y2 = y1

    draw.rectangle([tag_x1, tag_y1, tag_x2, tag_y2], fill=tag_bg)
    draw.text((tag_x1 + pad_x, tag_y1 + pad_y), text, fill=text_color, font=f)


def create_cctv_frame(
    dept_code: str,
    camera_id: str,
    camera_loc: str,
    timestamp: datetime,
    person_box: list[int],
    person_conf: float,
    violation_box: list[int],
    violation_label: str,
    violation_conf: float,
    secondary_boxes: list[dict[str, Any]],
    employee_name: str,
) -> Image.Image:
    W, H = 1280, 720
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)

    # 1. Background scene per department
    if dept_code == "bakery":
        # Warm ambient kitchen tones
        # Ceiling & back wall
        draw.rectangle([0, 0, W, 260], fill=(32, 28, 25))
        # Back wall shelves / tiles
        for y in range(80, 260, 40):
            draw.line([(0, y), (W, y)], fill=(45, 39, 34), width=1)
        # Floor with perspective tiles
        for y in range(260, H, 30):
            brightness = int(38 + (y - 260) * 0.05)
            draw.rectangle([0, y, W, min(H, y + 30)], fill=(brightness, brightness - 5, brightness - 10))
        for x in range(-200, W + 400, 120):
            draw.line([(W // 2, 220), (x, H)], fill=(28, 24, 20), width=2)
        
        # Draw background bakery elements
        # Commercial Oven on left
        draw.rectangle([60, 120, 260, 420], fill=(40, 42, 45), outline=(65, 68, 72), width=3)
        draw.rectangle([80, 180, 240, 280], fill=(220, 110, 20), outline=(100, 60, 20), width=2)  # Glowing oven glass
        draw.text((90, 140), "OVEN-MASTER 300°C", fill=(0, 255, 128), font=get_font(FONT_MONO_PATH, 12))

        # Stainless steel prep counter in center
        cx1, cy1, cx2, cy2 = 280, 460, 1020, 680
        draw.polygon([(cx1, cy1), (cx2, cy1), (cx2 + 100, cy2), (cx1 - 60, cy2)], fill=(65, 70, 78), outline=(90, 96, 108))
        draw.polygon([(cx1, cy1 - 15), (cx2, cy1 - 15), (cx2, cy1), (cx1, cy1)], fill=(95, 102, 112))
        
        # Pastry trays on counter
        for tx in range(320, 940, 160):
            draw.rectangle([tx, cy1 + 20, tx + 120, cy1 + 70], fill=(130, 90, 50), outline=(160, 110, 60), width=2)
            draw.ellipse([tx + 15, cy1 + 30, tx + 45, cy1 + 60], fill=(205, 145, 80))
            draw.ellipse([tx + 65, cy1 + 30, tx + 95, cy1 + 60], fill=(205, 145, 80))

    elif dept_code == "meat_shop":
        # Cold sterile butcher shop tones
        draw.rectangle([0, 0, W, 250], fill=(22, 28, 32))
        # Blue/white wall tiles
        for x in range(0, W, 50):
            draw.line([(x, 0), (x, 250)], fill=(32, 40, 48), width=1)
        for y in range(0, 250, 35):
            draw.line([(0, y), (W, y)], fill=(32, 40, 48), width=1)
        # Wet concrete/epoxy floor
        for y in range(250, H, 25):
            val = int(28 + (y - 250) * 0.04)
            draw.rectangle([0, y, W, min(H, y + 25)], fill=(val - 2, val + 4, val + 6))
        for x in range(-150, W + 300, 110):
            draw.line([(W // 2, 220), (x, H)], fill=(20, 26, 30), width=2)

        # Hanging meat rail near ceiling
        draw.line([(50, 90), (1230, 90)], fill=(120, 125, 130), width=6)
        for hx in (140, 260, 980, 1120):
            draw.line([(hx, 90), (hx, 140)], fill=(180, 185, 190), width=3)
            # Hanging meat carcass silhouette
            draw.polygon([(hx - 30, 140), (hx + 30, 140), (hx + 40, 360), (hx - 40, 360)], fill=(115, 35, 40), outline=(145, 45, 50))
            draw.line([(hx - 15, 160), (hx + 10, 340)], fill=(190, 150, 150), width=3)  # Fat marbling

        # Butcher Block table
        bx1, by1, bx2, by2 = 300, 470, 980, 680
        draw.polygon([(bx1, by1), (bx2, by1), (bx2 + 90, by2), (bx1 - 60, by2)], fill=(55, 62, 70), outline=(85, 92, 102))
        draw.polygon([(bx1, by1 - 18), (bx2, by1 - 18), (bx2, by1), (bx1, by1)], fill=(180, 185, 190))  # White cutting board

    else:
        # Security: Mall entrance / corridor atrium
        draw.rectangle([0, 0, W, 240], fill=(18, 22, 28))
        # High glass entrance doors & mall background
        draw.rectangle([150, 40, 1130, 240], fill=(26, 34, 44), outline=(45, 55, 70), width=2)
        draw.line([(640, 40), (640, 240)], fill=(60, 75, 95), width=4)  # Glass divider
        # Shiny terrazzo / tile floor with reflection lines
        for y in range(240, H, 25):
            val = int(24 + (y - 240) * 0.04)
            draw.rectangle([0, y, W, min(H, y + 25)], fill=(val, val + 2, val + 6))
        for x in range(-300, W + 500, 140):
            draw.line([(W // 2, 200), (x, H)], fill=(32, 40, 52), width=1)

        # Security turnstiles / checkpoint desk
        draw.polygon([(180, 440), (420, 440), (450, 600), (150, 600)], fill=(40, 48, 58), outline=(65, 78, 92))
        draw.rectangle([210, 360, 380, 440], fill=(15, 20, 28), outline=(80, 95, 115), width=2)
        draw.text((230, 390), "MONITOR 01 [LIVE]", fill=(0, 200, 255), font=get_font(FONT_MONO_PATH, 11))
        # Zone demarcation hazard stripes on floor
        draw.polygon([(680, 580), (1150, 580), (1240, 680), (620, 680)], fill=(40, 30, 10), outline=(220, 180, 20), width=2)
        draw.text((720, 620), "RESTRICTED SECURITY ZONE A", fill=(240, 200, 30), font=get_font(FONT_MONO_PATH, 14))

    # 2. Human subject silhouette in CCTV perspective
    px1, py1, px2, py2 = person_box
    pw = px2 - px1
    ph = py2 - py1
    head_cx = px1 + pw // 2
    head_cy = py1 + int(ph * 0.14)
    head_r = int(pw * 0.18)

    # Torso
    torso_top = head_cy + head_r
    torso_bot = py1 + int(ph * 0.65)
    torso_left = px1 + int(pw * 0.22)
    torso_right = px2 - int(pw * 0.22)

    # Department clothing colors
    if dept_code == "bakery":
        shirt_col = (210, 215, 220)
        pants_col = (50, 55, 60)
        apron_col = (180, 190, 200)
    elif dept_code == "meat_shop":
        shirt_col = (195, 200, 205)
        pants_col = (40, 45, 50)
        apron_col = (60, 75, 85)
    else:
        shirt_col = (25, 38, 58)  # Navy security shirt
        pants_col = (18, 25, 38)
        apron_col = shirt_col

    # Draw legs
    leg_w = int(pw * 0.18)
    draw.rectangle([torso_left + 8, torso_bot, torso_left + 8 + leg_w, py2], fill=pants_col)
    draw.rectangle([torso_right - 8 - leg_w, torso_bot, torso_right - 8, py2], fill=pants_col)

    # Draw torso
    draw.rectangle([torso_left, torso_top, torso_right, torso_bot], fill=shirt_col)
    if dept_code in ("bakery", "meat_shop"):
        draw.rectangle([torso_left + 6, torso_top + 20, torso_right - 6, torso_bot + 10], fill=apron_col)

    # Draw arms
    draw.line([(torso_left, torso_top + 10), (px1 + 10, torso_bot - 20)], fill=shirt_col, width=int(pw * 0.14))
    draw.line([(torso_right, torso_top + 10), (px2 - 10, torso_bot - 20)], fill=shirt_col, width=int(pw * 0.14))

    # Draw head / face
    skin_col = (198, 145, 115)
    draw.ellipse([head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r], fill=skin_col)
    # Hair
    draw.chord([head_cx - head_r, head_cy - head_r - 2, head_cx + head_r, head_cy], start=180, end=360, fill=(35, 25, 20))

    # 3. Subtle CCTV digital noise / scanline effect
    for y in range(0, H, 4):
        draw.line([(0, y), (W, y)], fill=(0, 0, 0, 30), width=1)

    # 4. Lens Vignetting
    # Draw subtle dark borders simulating surveillance lens
    draw.rectangle([0, 0, W, 8], fill=(0, 0, 0))
    draw.rectangle([0, H - 8, W, H], fill=(0, 0, 0))
    draw.rectangle([0, 0, 8, H], fill=(0, 0, 0))
    draw.rectangle([W - 8, 0, W, H], fill=(0, 0, 0))

    # 5. Draw YOLO Overlays
    yolo_font = get_font(FONT_BOLD_PATH, 13)
    tag_font = get_font(FONT_BOLD_PATH, 12)

    # Draw Person Detection Box (Electric Cyan)
    draw_yolo_box(
        draw,
        person_box,
        f"person: {employee_name}",
        person_conf,
        color=(0, 230, 255),
        text_color=(0, 20, 35),
        font=yolo_font,
        tag_font=tag_font,
    )

    # Draw Secondary Object detections (Orange/Yellow/Cyan)
    for s in secondary_boxes:
        s_box = s["box"]
        s_label = s["label"]
        s_conf = s["confidence"]
        s_col = s.get("color", (255, 185, 0))
        draw_yolo_box(
            draw,
            s_box,
            s_label,
            s_conf,
            color=s_col,
            text_color=(15, 15, 15),
            font=yolo_font,
            tag_font=tag_font,
        )

    # Draw Primary Violation Box (Neon Red)
    draw_yolo_box(
        draw,
        violation_box,
        violation_label,
        violation_conf,
        color=(255, 25, 60),
        text_color=(255, 255, 255),
        tag_bg_color=(255, 25, 60),
        font=yolo_font,
        tag_font=tag_font,
    )

    # 6. CCTV On-Screen Display (OSD) / HUD
    hud_font = get_font(FONT_MONO_PATH, 15)
    hud_bold = get_font(FONT_BOLD_PATH, 14)
    hud_small = get_font(FONT_MONO_PATH, 12)

    # Top Left HUD
    # REC Indicator with glowing red dot
    draw.ellipse([24, 22, 38, 36], fill=(255, 30, 30))
    draw.text((46, 20), "● REC", fill=(255, 50, 50), font=hud_bold)
    draw.text((115, 20), f"| {camera_id} [{camera_loc.upper()}]", fill=(230, 240, 255), font=hud_font)
    draw.text((24, 44), "1080P 30FPS  CH-02  H.265  4096Kbps", fill=(160, 180, 200), font=hud_small)

    # Top Right HUD (Timestamp)
    ts_str = timestamp.strftime("%Y-%m-%d  %H:%M:%S  PKT")
    draw.text((W - 360, 20), ts_str, fill=(255, 255, 255), font=hud_font)
    draw.text((W - 360, 44), "NTP SYNC: LOCK  LATENCY: 12ms", fill=(140, 170, 190), font=hud_small)

    # Center crosshair
    cx, cy = W // 2, H // 2
    draw.line([(cx - 15, cy), (cx + 15, cy)], fill=(120, 200, 255, 120), width=1)
    draw.line([(cx, cy - 15), (cx, cy + 15)], fill=(120, 200, 255, 120), width=1)

    # Bottom Left HUD - Distinct Dummy Evidence Badge
    badge_bg = (15, 23, 42)
    draw.rectangle([20, H - 56, 680, H - 20], fill=badge_bg, outline=(0, 210, 255), width=2)
    draw.text(
        (32, H - 48),
        "[ MallSentinel AI Vision ]  evidenceSource: DUMMY  •  YOLOv8x Inference Simulation",
        fill=(0, 240, 255),
        font=hud_bold,
    )

    # Bottom Right HUD - PTZ & Camera specs
    draw.text((W - 380, H - 46), f"LENS: 2.8mm FOV: 104° | PTZ: LOCK", fill=(180, 200, 220), font=hud_small)

    return img


# Metadata for 30 distinct records
EVIDENCE_CONFIGS = [
    # --- BAKERY (10 records) ---
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-01",
        "cam_loc": "Bakery Prep Table 1",
        "emp_idx": 1,
        "violation": "No Hairnet",
        "severity": PenaltySeverity.high,
        "conf": 0.94,
        "person_box": [380, 170, 780, 670],
        "person_conf": 0.96,
        "violation_box": [510, 170, 650, 260],
        "secondary": [
            {"label": "apron", "confidence": 0.92, "box": [430, 360, 730, 600], "color": (0, 200, 255)},
            {"label": "prep_table", "confidence": 0.97, "box": [260, 460, 960, 680], "color": (255, 190, 0)},
        ],
        "offset_hours": 3,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-01",
        "cam_loc": "Bakery Prep Table 1",
        "emp_idx": 1,
        "violation": "No Gloves",
        "severity": PenaltySeverity.high,
        "conf": 0.89,
        "person_box": [400, 160, 800, 670],
        "person_conf": 0.95,
        "violation_box": [440, 420, 560, 510],
        "secondary": [
            {"label": "baking_tray", "confidence": 0.93, "box": [520, 470, 720, 560], "color": (255, 190, 0)},
            {"label": "hairnet", "confidence": 0.94, "box": [520, 160, 660, 240], "color": (0, 200, 255)},
        ],
        "offset_hours": 6,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Confirmed violation on shift 1. Issued verbal reminder to wear food-grade nitrile gloves.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-02",
        "cam_loc": "Oven Station South",
        "emp_idx": 2,
        "violation": "No Face Mask",
        "severity": PenaltySeverity.medium,
        "conf": 0.91,
        "person_box": [490, 180, 850, 680],
        "person_conf": 0.94,
        "violation_box": [610, 250, 710, 325],
        "secondary": [
            {"label": "industrial_oven", "confidence": 0.98, "box": [80, 120, 360, 480], "color": (200, 200, 210)},
            {"label": "hairnet", "confidence": 0.93, "box": [590, 180, 730, 250], "color": (0, 200, 255)},
        ],
        "offset_hours": 9,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-02",
        "cam_loc": "Oven Station South",
        "emp_idx": 1,
        "violation": "No Apron",
        "severity": PenaltySeverity.medium,
        "conf": 0.88,
        "person_box": [360, 170, 740, 670],
        "person_conf": 0.95,
        "violation_box": [400, 320, 700, 580],
        "secondary": [
            {"label": "hairnet", "confidence": 0.92, "box": [480, 170, 600, 245], "color": (0, 200, 255)},
        ],
        "offset_hours": 12,
        "status": EvidenceReviewStatus.rejected,
        "remarks": "Employee had just taken apron off to replace it after washing. Not a willful breach.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-03",
        "cam_loc": "Pastry Display Counter",
        "emp_idx": 2,
        "violation": "No Gloves",
        "severity": PenaltySeverity.high,
        "conf": 0.95,
        "person_box": [450, 160, 810, 660],
        "person_conf": 0.96,
        "violation_box": [520, 420, 650, 510],
        "secondary": [
            {"label": "pastry_case", "confidence": 0.97, "box": [220, 450, 1060, 670], "color": (255, 190, 0)},
            {"label": "mask", "confidence": 0.91, "box": [570, 240, 670, 305], "color": (0, 200, 255)},
        ],
        "offset_hours": 15,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-03",
        "cam_loc": "Pastry Display Counter",
        "emp_idx": 2,
        "violation": "No Hairnet",
        "severity": PenaltySeverity.critical,
        "conf": 0.96,
        "person_box": [430, 160, 790, 670],
        "person_conf": 0.96,
        "violation_box": [530, 160, 670, 250],
        "secondary": [
            {"label": "apron", "confidence": 0.93, "box": [470, 340, 750, 580], "color": (0, 200, 255)},
        ],
        "offset_hours": 18,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Severe SOP breach in front of customers. Written warning issued.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-04",
        "cam_loc": "Dough Mixer Area",
        "emp_idx": 1,
        "violation": "Beard Net Missing",
        "severity": PenaltySeverity.medium,
        "conf": 0.87,
        "person_box": [380, 170, 760, 680],
        "person_conf": 0.93,
        "violation_box": [500, 260, 630, 340],
        "secondary": [
            {"label": "dough_mixer", "confidence": 0.96, "box": [680, 260, 1080, 660], "color": (200, 200, 210)},
            {"label": "hairnet", "confidence": 0.94, "box": [490, 170, 630, 250], "color": (0, 200, 255)},
        ],
        "offset_hours": 21,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-04",
        "cam_loc": "Dough Mixer Area",
        "emp_idx": 1,
        "violation": "Eating In Food Prep Zone",
        "severity": PenaltySeverity.critical,
        "conf": 0.93,
        "person_box": [370, 160, 750, 670],
        "person_conf": 0.94,
        "violation_box": [480, 260, 590, 360],
        "secondary": [
            {"label": "beverage_cup", "confidence": 0.91, "box": [560, 380, 630, 470], "color": (255, 100, 0)},
        ],
        "offset_hours": 24,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Food consumption strictly prohibited in production station. Fine of PKR 1,000 imposed.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-05",
        "cam_loc": "Packaging Line West",
        "emp_idx": 2,
        "violation": "No Face Mask",
        "severity": PenaltySeverity.low,
        "conf": 0.86,
        "person_box": [470, 180, 830, 670],
        "person_conf": 0.92,
        "violation_box": [590, 250, 690, 320],
        "secondary": [
            {"label": "carton_box", "confidence": 0.94, "box": [530, 420, 780, 610], "color": (255, 190, 0)},
        ],
        "offset_hours": 28,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-05",
        "cam_loc": "Packaging Line West",
        "emp_idx": 2,
        "violation": "No Gloves",
        "severity": PenaltySeverity.high,
        "conf": 0.92,
        "person_box": [450, 170, 810, 660],
        "person_conf": 0.95,
        "violation_box": [520, 430, 640, 515],
        "secondary": [
            {"label": "hairnet", "confidence": 0.95, "box": [560, 170, 680, 245], "color": (0, 200, 255)},
            {"label": "mask", "confidence": 0.92, "box": [575, 245, 665, 310], "color": (0, 200, 255)},
        ],
        "offset_hours": 32,
        "status": EvidenceReviewStatus.pending,
    },

    # --- MEAT SHOP (10 records) ---
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-01",
        "cam_loc": "Butcher Block Alpha",
        "emp_idx": 1,
        "violation": "No Cut-Resistant Gloves",
        "severity": PenaltySeverity.critical,
        "conf": 0.96,
        "person_box": [410, 160, 820, 680],
        "person_conf": 0.97,
        "violation_box": [460, 410, 580, 510],
        "secondary": [
            {"label": "butcher_cleaver", "confidence": 0.96, "box": [620, 390, 750, 470], "color": (255, 80, 0)},
            {"label": "raw_beef_slab", "confidence": 0.94, "box": [420, 480, 680, 580], "color": (255, 190, 0)},
        ],
        "offset_hours": 4,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-01",
        "cam_loc": "Butcher Block Alpha",
        "emp_idx": 1,
        "violation": "No Hairnet",
        "severity": PenaltySeverity.high,
        "conf": 0.91,
        "person_box": [390, 170, 790, 670],
        "person_conf": 0.94,
        "violation_box": [510, 170, 650, 260],
        "secondary": [
            {"label": "rubber_apron", "confidence": 0.95, "box": [440, 350, 740, 590], "color": (0, 200, 255)},
        ],
        "offset_hours": 7,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Reviewed on CCTV playback. Hairnet was resting on collar instead of head. Warning issued.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-02",
        "cam_loc": "Cold Storage Carcass Area",
        "emp_idx": 2,
        "violation": "Missing Protective Apron",
        "severity": PenaltySeverity.high,
        "conf": 0.89,
        "person_box": [440, 170, 800, 680],
        "person_conf": 0.93,
        "violation_box": [470, 320, 760, 580],
        "secondary": [
            {"label": "hanging_carcass", "confidence": 0.97, "box": [140, 120, 360, 520], "color": (200, 60, 60)},
        ],
        "offset_hours": 10,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-02",
        "cam_loc": "Cold Storage Carcass Area",
        "emp_idx": 2,
        "violation": "No Face Mask",
        "severity": PenaltySeverity.medium,
        "conf": 0.92,
        "person_box": [460, 180, 820, 680],
        "person_conf": 0.95,
        "violation_box": [580, 255, 680, 325],
        "secondary": [
            {"label": "thermal_jacket", "confidence": 0.96, "box": [470, 300, 780, 560], "color": (0, 200, 255)},
        ],
        "offset_hours": 13,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Sanitation violation inside cold storage. Mask re-issued on spot.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-03",
        "cam_loc": "Meat Grinder Station",
        "emp_idx": 1,
        "violation": "No Gloves",
        "severity": PenaltySeverity.critical,
        "conf": 0.95,
        "person_box": [370, 170, 760, 670],
        "person_conf": 0.95,
        "violation_box": [440, 420, 560, 510],
        "secondary": [
            {"label": "meat_grinder", "confidence": 0.98, "box": [640, 280, 1040, 660], "color": (200, 200, 215)},
        ],
        "offset_hours": 16,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-03",
        "cam_loc": "Meat Grinder Station",
        "emp_idx": 1,
        "violation": "Loose Clothing Near Mincer",
        "severity": PenaltySeverity.critical,
        "conf": 0.94,
        "person_box": [360, 160, 750, 670],
        "person_conf": 0.94,
        "violation_box": [410, 360, 580, 540],
        "secondary": [
            {"label": "grinder_hopper", "confidence": 0.96, "box": [650, 300, 980, 620], "color": (255, 100, 0)},
        ],
        "offset_hours": 20,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Major mechanical hazard. Worker rolled sleeve immediately following alert.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-04",
        "cam_loc": "Bone Saw Cutting Station",
        "emp_idx": 2,
        "violation": "No Eye Protection / Visor",
        "severity": PenaltySeverity.high,
        "conf": 0.90,
        "person_box": [420, 170, 800, 680],
        "person_conf": 0.95,
        "violation_box": [530, 205, 660, 275],
        "secondary": [
            {"label": "bone_saw_blade", "confidence": 0.98, "box": [190, 240, 480, 640], "color": (255, 80, 0)},
        ],
        "offset_hours": 23,
        "status": EvidenceReviewStatus.rejected,
        "remarks": "Employee had transparent safety goggles on; lighting reflection obscured visor in bounding box.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-04",
        "cam_loc": "Bone Saw Cutting Station",
        "emp_idx": 2,
        "violation": "No Mesh Glove",
        "severity": PenaltySeverity.critical,
        "conf": 0.97,
        "person_box": [400, 160, 790, 670],
        "person_conf": 0.96,
        "violation_box": [440, 430, 570, 520],
        "secondary": [
            {"label": "bone_saw_blade", "confidence": 0.97, "box": [180, 260, 460, 630], "color": (255, 80, 0)},
        ],
        "offset_hours": 26,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-05",
        "cam_loc": "Meat Packaging Counter",
        "emp_idx": 1,
        "violation": "Bare Hand Contact With Raw Meat",
        "severity": PenaltySeverity.high,
        "conf": 0.93,
        "person_box": [440, 180, 820, 680],
        "person_conf": 0.95,
        "violation_box": [520, 450, 660, 530],
        "secondary": [
            {"label": "raw_meat_cut", "confidence": 0.96, "box": [580, 470, 770, 560], "color": (255, 190, 0)},
        ],
        "offset_hours": 30,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-05",
        "cam_loc": "Meat Packaging Counter",
        "emp_idx": 2,
        "violation": "No Face Mask",
        "severity": PenaltySeverity.low,
        "conf": 0.85,
        "person_box": [460, 170, 820, 670],
        "person_conf": 0.94,
        "violation_box": [580, 250, 680, 320],
        "secondary": [
            {"label": "vacuum_packer", "confidence": 0.93, "box": [510, 410, 760, 530], "color": (0, 200, 255)},
        ],
        "offset_hours": 34,
        "status": EvidenceReviewStatus.pending,
    },

    # --- SECURITY (10 records) ---
    {
        "dept": "security",
        "cam_id": "CAM-SC-01",
        "cam_loc": "Main Mall Entrance Gate A",
        "emp_idx": 1,
        "violation": "Guard Left Assigned Duty Zone",
        "severity": PenaltySeverity.critical,
        "conf": 0.96,
        "person_box": [740, 210, 1040, 680],
        "person_conf": 0.96,
        "violation_box": [720, 190, 1060, 690],
        "secondary": [
            {"label": "assigned_zone_gate", "confidence": 0.98, "box": [160, 380, 520, 660], "color": (255, 200, 0)},
            {"label": "guard_uniform", "confidence": 0.94, "box": [760, 310, 1020, 580], "color": (0, 200, 255)},
        ],
        "offset_hours": 2,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-01",
        "cam_loc": "Main Mall Entrance Gate A",
        "emp_idx": 1,
        "violation": "Improper Uniform - Missing Beret/Cap",
        "severity": PenaltySeverity.low,
        "conf": 0.88,
        "person_box": [420, 160, 780, 680],
        "person_conf": 0.95,
        "violation_box": [530, 160, 660, 250],
        "secondary": [
            {"label": "security_badge", "confidence": 0.96, "box": [530, 320, 610, 390], "color": (0, 200, 255)},
            {"label": "duty_belt", "confidence": 0.92, "box": [470, 440, 720, 510], "color": (255, 190, 0)},
        ],
        "offset_hours": 5,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Beret was left in security locker during briefing. Noted on personnel file.",
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-02",
        "cam_loc": "Cashier & Vault Perimeter",
        "emp_idx": 2,
        "violation": "Unholstered Weapon / Unsecured Holster",
        "severity": PenaltySeverity.critical,
        "conf": 0.95,
        "person_box": [440, 170, 810, 680],
        "person_conf": 0.97,
        "violation_box": [620, 400, 750, 510],
        "secondary": [
            {"label": "holster_unlatched", "confidence": 0.95, "box": [580, 410, 700, 490], "color": (255, 80, 0)},
            {"label": "vault_door", "confidence": 0.98, "box": [120, 100, 380, 500], "color": (200, 200, 220)},
        ],
        "offset_hours": 8,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-02",
        "cam_loc": "Cashier & Vault Perimeter",
        "emp_idx": 2,
        "violation": "Mobile Phone Distraction On Post",
        "severity": PenaltySeverity.high,
        "conf": 0.92,
        "person_box": [420, 160, 790, 670],
        "person_conf": 0.95,
        "violation_box": [530, 340, 660, 440],
        "secondary": [
            {"label": "smartphone", "confidence": 0.93, "box": [570, 360, 630, 430], "color": (255, 100, 0)},
        ],
        "offset_hours": 11,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Guard was watching videos during high-security transport. Official warning issued.",
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-03",
        "cam_loc": "Rear Loading Dock & Bay",
        "emp_idx": 1,
        "violation": "Guard Sleeping / Inattentive On Duty",
        "severity": PenaltySeverity.critical,
        "conf": 0.97,
        "person_box": [400, 270, 820, 660],
        "person_conf": 0.96,
        "violation_box": [460, 250, 730, 520],
        "secondary": [
            {"label": "loading_gate", "confidence": 0.97, "box": [120, 160, 380, 580], "color": (200, 200, 210)},
        ],
        "offset_hours": 14,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Gross negligence during night shift. Transferred to day duty and 1-day suspension recommended.",
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-03",
        "cam_loc": "Rear Loading Dock & Bay",
        "emp_idx": 1,
        "violation": "Missing High-Visibility Vest",
        "severity": PenaltySeverity.medium,
        "conf": 0.89,
        "person_box": [440, 180, 800, 680],
        "person_conf": 0.94,
        "violation_box": [470, 310, 760, 570],
        "secondary": [
            {"label": "security_uniform", "confidence": 0.93, "box": [460, 300, 770, 560], "color": (0, 200, 255)},
        ],
        "offset_hours": 17,
        "status": EvidenceReviewStatus.rejected,
        "remarks": "Guard had vest hung on chair right beside him to attach radio harness. Corrected within 20s.",
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-04",
        "cam_loc": "North Corridor Turnstiles",
        "emp_idx": 2,
        "violation": "Unauthorized Person In Guard Booth",
        "severity": PenaltySeverity.high,
        "conf": 0.93,
        "person_box": [320, 200, 580, 660],
        "person_conf": 0.96,
        "violation_box": [620, 210, 900, 670],
        "secondary": [
            {"label": "guard_booth", "confidence": 0.98, "box": [240, 300, 960, 680], "color": (255, 190, 0)},
        ],
        "offset_hours": 22,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-04",
        "cam_loc": "North Corridor Turnstiles",
        "emp_idx": 2,
        "violation": "Improper Uniform - Non-regulation Jacket",
        "severity": PenaltySeverity.low,
        "conf": 0.87,
        "person_box": [430, 170, 800, 680],
        "person_conf": 0.93,
        "violation_box": [460, 280, 770, 560],
        "secondary": [
            {"label": "turnstile_gate", "confidence": 0.95, "box": [160, 380, 410, 660], "color": (0, 200, 255)},
        ],
        "offset_hours": 25,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-05",
        "cam_loc": "Basement Parking Entry",
        "emp_idx": 1,
        "violation": "Guard Away From Pedestrian Gate",
        "severity": PenaltySeverity.high,
        "conf": 0.91,
        "person_box": [780, 230, 1060, 680],
        "person_conf": 0.95,
        "violation_box": [750, 210, 1080, 690],
        "secondary": [
            {"label": "parking_barrier", "confidence": 0.97, "box": [160, 360, 520, 650], "color": (255, 190, 0)},
        ],
        "offset_hours": 29,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-05",
        "cam_loc": "Basement Parking Entry",
        "emp_idx": 2,
        "violation": "Missing Duty Radio / Belt Equipment",
        "severity": PenaltySeverity.medium,
        "conf": 0.89,
        "person_box": [420, 170, 790, 680],
        "person_conf": 0.95,
        "violation_box": [490, 420, 630, 510],
        "secondary": [
            {"label": "beret_cap", "confidence": 0.94, "box": [520, 170, 650, 250], "color": (0, 200, 255)},
        ],
        "offset_hours": 33,
        "status": EvidenceReviewStatus.pending,
    },
]


async def seed_cctv_evidence() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)

    async with SessionLocal() as db:
        # Load departments
        depts_res = await db.scalars(select(Department))
        depts = {d.code: d for d in depts_res.all()}

        # Load supervisors and employees per department
        users_res = await db.scalars(select(User))
        users = list(users_res.all())
        supervisors_by_dept: dict[str, User] = {}
        employees_by_dept: dict[str, list[User]] = {"bakery": [], "meat_shop": [], "security": []}

        for u in users:
            if u.role == UserRole.supervisor and u.supervisor_profile:
                for code, dept in depts.items():
                    if u.supervisor_profile.department_id == dept.id:
                        supervisors_by_dept[code] = u
            elif u.role == UserRole.employee and u.employee_profile:
                for code, dept in depts.items():
                    if u.employee_profile.department_id == dept.id:
                        employees_by_dept[code].append(u)

        # Clear any previous DUMMY evidence
        await db.execute(delete(CctvEvidence).where(CctvEvidence.evidence_source == "DUMMY"))
        await db.flush()

        print(f"Generating 30 YOLO-style CCTV dummy evidence records and images...")

        for idx, cfg in enumerate(EVIDENCE_CONFIGS, start=1):
            dept_code = cfg["dept"]
            dept = depts[dept_code]
            sup = supervisors_by_dept.get(dept_code)
            emp_list = employees_by_dept.get(dept_code, [])
            emp = emp_list[cfg["emp_idx"] - 1] if len(emp_list) >= cfg["emp_idx"] else (emp_list[0] if emp_list else None)
            emp_name = emp.full_name if emp else "Staff Member"

            record_id = uuid.uuid4()
            captured_at = now - timedelta(hours=cfg["offset_hours"], minutes=random.randint(5, 55))
            filename = f"cctv_{dept_code}_{idx:02d}_{cfg['cam_id']}.jpg"
            filepath = STORAGE_DIR / filename

            # Generate realistic CCTV image with YOLO overlays
            img = create_cctv_frame(
                dept_code=dept_code,
                camera_id=cfg["cam_id"],
                camera_loc=cfg["cam_loc"],
                timestamp=captured_at,
                person_box=cfg["person_box"],
                person_conf=cfg["person_conf"],
                violation_box=cfg["violation_box"],
                violation_label=cfg["violation"],
                violation_conf=cfg["conf"],
                secondary_boxes=cfg["secondary"],
                employee_name=emp_name,
            )
            img.save(filepath, format="JPEG", quality=90)

            # Format detection labels structure
            det_labels = [
                {
                    "label": "person",
                    "confidence": cfg["person_conf"],
                    "box": cfg["person_box"],
                    "type": "entity",
                },
                {
                    "label": cfg["violation"],
                    "confidence": cfg["conf"],
                    "box": cfg["violation_box"],
                    "type": "violation",
                },
            ]
            for s in cfg["secondary"]:
                det_labels.append({
                    "label": s["label"],
                    "confidence": s["confidence"],
                    "box": s["box"],
                    "type": "context",
                })

            # Check Cloudinary upload if configured
            cloud_public_id = f"mallsentinel/evidence/{dept_code}_{idx:02d}_{cfg['cam_id']}"
            image_url = f"{settings.API_PREFIX}/evidence/{record_id}/image"

            if settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY:
                try:
                    import cloudinary
                    import cloudinary.uploader

                    cloudinary.config(
                        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                        api_key=settings.CLOUDINARY_API_KEY,
                        api_secret=settings.CLOUDINARY_API_SECRET,
                    )
                    upload_res = cloudinary.uploader.upload(
                        str(filepath),
                        public_id=cloud_public_id,
                        folder="mallsentinel/evidence",
                        overwrite=True,
                    )
                    image_url = upload_res.get("secure_url", image_url)
                    cloud_public_id = upload_res.get("public_id", cloud_public_id)
                except Exception as exc:
                    print(f"Cloudinary upload skipped or failed for {filename}: {exc}")

            review_status = cfg["status"]
            reviewed_by_id = sup.id if (sup and review_status != EvidenceReviewStatus.pending) else None
            reviewed_at = (captured_at + timedelta(minutes=random.randint(15, 90))) if reviewed_by_id else None
            remarks = cfg.get("remarks")

            evidence_record = CctvEvidence(
                id=record_id,
                evidence_source="DUMMY",
                department_id=dept.id,
                employee_id=emp.id if emp else None,
                camera_id=cfg["cam_id"],
                camera_location=cfg["cam_loc"],
                violation_type=cfg["violation"],
                severity=cfg["severity"],
                confidence_score=cfg["conf"],
                detection_labels=det_labels,
                image_url=image_url,
                image_filename=filename,
                cloudinary_public_id=cloud_public_id,
                captured_at=captured_at,
                review_status=review_status,
                reviewed_by_id=reviewed_by_id,
                reviewed_at=reviewed_at,
                supervisor_remarks=remarks,
            )
            db.add(evidence_record)

        await db.commit()
        print("Successfully created 30 dummy CCTV evidence records and images (10 Bakery, 10 Meat Shop, 10 Security)!")

    await engine.dispose()


if __name__ == "__main__":
    import asyncio
    asyncio.run(seed_cctv_evidence())

