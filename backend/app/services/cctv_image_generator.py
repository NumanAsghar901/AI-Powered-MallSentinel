"""Generates 30 realistic, high-fidelity YOLO-annotated CCTV compliance evidence images
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
    # Windows fallback
    win_arial = "C:/Windows/Fonts/arialbd.ttf"
    if os.path.exists(win_arial):
        try:
            return ImageFont.truetype(win_arial, size)
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
    bracket_len = min(20, max(6, (x2 - x1) // 3), max(6, (y2 - y1) // 3))
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

    try:
        bbox = f.getbbox(text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
    except Exception:
        tw = len(text) * 8
        th = 14

    pad_x, pad_y = 6, 4
    tag_h = th + (pad_y * 2)
    tag_w = tw + (pad_x * 2)
    tag_x1 = max(10, x1)
    if y1 - tag_h - 2 >= 65:
        tag_y1 = y1 - tag_h - 2
        tag_y2 = y1
    else:
        # Keep inside bounding box boundary
        tag_y1 = y1
        tag_y2 = y1 + tag_h
    tag_x2 = min(1270, tag_x1 + tag_w)

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

    dept_display = "Bakery" if dept_code == "bakery" else ("Meat Shop" if dept_code == "meat_shop" else "Security")

    # 1. Background scene per department
    if dept_code == "bakery":
        # Ceiling & back wall
        draw.rectangle([0, 0, W, 260], fill=(32, 28, 25))
        for y in range(80, 260, 40):
            draw.line([(0, y), (W, y)], fill=(45, 39, 34), width=1)
        # Floor with perspective tiles
        for y in range(260, H, 30):
            brightness = int(38 + (y - 260) * 0.05)
            draw.rectangle([0, y, W, min(H, y + 30)], fill=(brightness, brightness - 5, brightness - 10))
        for x in range(-200, W + 400, 120):
            draw.line([(W // 2, 220), (x, H)], fill=(28, 24, 20), width=2)

        # Commercial Oven on left
        draw.rectangle([60, 120, 260, 420], fill=(40, 42, 45), outline=(65, 68, 72), width=3)
        draw.rectangle([80, 180, 240, 280], fill=(220, 110, 20), outline=(100, 60, 20), width=2)
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
        for x in range(0, W, 50):
            draw.line([(x, 0), (x, 250)], fill=(32, 40, 48), width=1)
        for y in range(0, 250, 35):
            draw.line([(0, y), (W, y)], fill=(32, 40, 48), width=1)
        for y in range(250, H, 25):
            val = int(28 + (y - 250) * 0.04)
            draw.rectangle([0, y, W, min(H, y + 25)], fill=(val - 2, val + 4, val + 6))
        for x in range(-150, W + 300, 110):
            draw.line([(W // 2, 220), (x, H)], fill=(20, 26, 30), width=2)

        # Hanging meat rail near ceiling
        draw.line([(50, 90), (1230, 90)], fill=(120, 125, 130), width=6)
        for hx in (140, 260, 980, 1120):
            draw.line([(hx, 90), (hx, 140)], fill=(180, 185, 190), width=3)
            draw.polygon([(hx - 30, 140), (hx + 30, 140), (hx + 40, 360), (hx - 40, 360)], fill=(115, 35, 40), outline=(145, 45, 50))
            draw.line([(hx - 15, 160), (hx + 10, 340)], fill=(190, 150, 150), width=3)

        # Butcher Block table
        bx1, by1, bx2, by2 = 300, 470, 980, 680
        draw.polygon([(bx1, by1), (bx2, by1), (bx2 + 90, by2), (bx1 - 60, by2)], fill=(55, 62, 70), outline=(85, 92, 102))
        draw.polygon([(bx1, by1 - 18), (bx2, by1 - 18), (bx2, by1), (bx1, by1)], fill=(180, 185, 190))

    else:
        # Security: Mall entrance / corridor atrium
        draw.rectangle([0, 0, W, 240], fill=(18, 22, 28))
        draw.rectangle([150, 40, 1130, 240], fill=(26, 34, 44), outline=(45, 55, 70), width=2)
        draw.line([(640, 40), (640, 240)], fill=(60, 75, 95), width=4)
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

    # 2. Human subject silhouette & compliance equipment
    px1, py1, px2, py2 = person_box
    pw = px2 - px1
    ph = py2 - py1
    head_cx = px1 + pw // 2
    head_cy = py1 + int(ph * 0.14)
    head_r = int(pw * 0.18)

    torso_top = head_cy + head_r
    torso_bot = py1 + int(ph * 0.65)
    torso_left = px1 + int(pw * 0.22)
    torso_right = px2 - int(pw * 0.22)

    has_hairnet_violation = "Hairnet" in violation_label
    has_apron_violation = "Apron" in violation_label
    has_gloves_violation = "Glove" in violation_label or "Bare Hand" in violation_label
    has_weapon_violation = "Weapon" in violation_label or "Firearm" in violation_label
    has_walkie_violation = "Walkie" in violation_label or "Radio" in violation_label
    has_uniform_violation = "Uniform" in violation_label

    if dept_code == "bakery":
        shirt_col = (215, 220, 225)
        pants_col = (50, 55, 60)
        apron_col = (240, 242, 245)
    elif dept_code == "meat_shop":
        shirt_col = (200, 205, 210)
        pants_col = (40, 45, 50)
        apron_col = (48, 62, 78)  # Heavy protective rubber apron
    else:
        shirt_col = (22, 34, 52)  # Navy security shirt
        pants_col = (16, 22, 34)
        apron_col = shirt_col

    # Draw legs
    leg_w = int(pw * 0.18)
    draw.rectangle([torso_left + 8, torso_bot, torso_left + 8 + leg_w, py2], fill=pants_col)
    draw.rectangle([torso_right - 8 - leg_w, torso_bot, torso_right - 8, py2], fill=pants_col)

    # Draw torso
    draw.rectangle([torso_left, torso_top, torso_right, torso_bot], fill=shirt_col)

    # Apron rendering (Bakery / Meat Shop)
    if dept_code in ("bakery", "meat_shop"):
        if not has_apron_violation:
            # Full protective apron
            draw.rectangle([torso_left + 4, torso_top + 16, torso_right - 4, torso_bot + 16], fill=apron_col, outline=(140, 150, 160))
            # Apron neck strap
            draw.line([(torso_left + 14, torso_top + 16), (head_cx - 8, torso_top)], fill=(80, 85, 90), width=2)
            draw.line([(torso_right - 14, torso_top + 16), (head_cx + 8, torso_top)], fill=(80, 85, 90), width=2)

    # Arms
    arm_w = int(pw * 0.14)
    left_hand_pos = (px1 + 10, torso_bot - 15)
    right_hand_pos = (px2 - 10, torso_bot - 15)
    draw.line([(torso_left, torso_top + 10), left_hand_pos], fill=shirt_col, width=arm_w)
    draw.line([(torso_right, torso_top + 10), right_hand_pos], fill=shirt_col, width=arm_w)

    # Hands & Gloves rendering
    skin_col = (198, 145, 115)
    hand_r = int(arm_w * 0.7)
    if dept_code == "bakery":
        hand_color = skin_col if has_gloves_violation else (0, 190, 235)  # Blue nitrile gloves
    elif dept_code == "meat_shop":
        hand_color = skin_col if has_gloves_violation else (195, 205, 215)  # Steel chainmail mesh gloves
    else:
        hand_color = skin_col

    draw.ellipse([left_hand_pos[0] - hand_r, left_hand_pos[1] - hand_r, left_hand_pos[0] + hand_r, left_hand_pos[1] + hand_r], fill=hand_color)
    draw.ellipse([right_hand_pos[0] - hand_r, right_hand_pos[1] - hand_r, right_hand_pos[0] + hand_r, right_hand_pos[1] + hand_r], fill=hand_color)

    # Head & Face
    draw.ellipse([head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r], fill=skin_col)

    # Hair / Hairnet / Beret
    if dept_code in ("bakery", "meat_shop"):
        if has_hairnet_violation:
            # Uncovered brown/black hair
            draw.chord([head_cx - head_r, head_cy - head_r - 2, head_cx + head_r, head_cy + 2], start=180, end=360, fill=(40, 26, 18))
        else:
            # Compliant sanitary hairnet
            draw.chord([head_cx - head_r - 2, head_cy - head_r - 4, head_cx + head_r + 2, head_cy + 4], start=175, end=365, fill=(210, 235, 255), outline=(0, 200, 255), width=2)
            for hx in range(head_cx - head_r + 4, head_cx + head_r - 2, 8):
                draw.line([(hx, head_cy - head_r - 2), (hx, head_cy)], fill=(160, 210, 245), width=1)
    else:
        # Security: Beret / Cap
        if not has_uniform_violation:
            draw.chord([head_cx - head_r - 2, head_cy - head_r - 6, head_cx + head_r + 4, head_cy - 2], start=170, end=370, fill=(18, 28, 44), outline=(220, 185, 40), width=2)
            draw.ellipse([head_cx - 4, head_cy - head_r - 4, head_cx + 4, head_cy - head_r + 2], fill=(225, 190, 45))  # Gold emblem
        else:
            draw.chord([head_cx - head_r, head_cy - head_r - 2, head_cx + head_r, head_cy], start=180, end=360, fill=(35, 25, 20))

    # Security Specific Equipment (Duty Belt, Holstered Firearm, Walkie Talkie, Chest Badge)
    if dept_code == "security":
        # Shoulder epaulets & chest badge
        draw.rectangle([torso_left - 2, torso_top + 2, torso_left + 16, torso_top + 8], fill=(220, 185, 40))
        draw.rectangle([torso_right - 16, torso_top + 2, torso_right + 2, torso_top + 8], fill=(220, 185, 40))
        draw.polygon([(torso_left + 10, torso_top + 16), (torso_left + 22, torso_top + 16), (torso_left + 16, torso_top + 28)], fill=(235, 195, 45))  # Gold shield badge

        # Duty Belt
        belt_y = torso_bot - 12
        draw.rectangle([torso_left - 2, belt_y, torso_right + 2, belt_y + 12], fill=(12, 14, 18), outline=(60, 65, 75))
        draw.rectangle([head_cx - 8, belt_y + 1, head_cx + 8, belt_y + 11], fill=(210, 180, 40))  # Buckle

        # Firearm Holster on Right Hip
        holster_x1, holster_y1 = torso_right - 4, belt_y + 2
        holster_x2, holster_y2 = torso_right + 18, belt_y + 36
        if not has_weapon_violation:
            draw.rectangle([holster_x1, holster_y1, holster_x2, holster_y2], fill=(18, 18, 22), outline=(50, 55, 65), width=2)
            # Grip of sidearm
            draw.polygon([(holster_x1 + 4, holster_y1 - 6), (holster_x2 - 2, holster_y1 - 6), (holster_x2 - 4, holster_y1 + 4), (holster_x1 + 4, holster_y1 + 4)], fill=(40, 42, 46))
        else:
            # Unlatched or empty holster violation
            draw.rectangle([holster_x1, holster_y1, holster_x2, holster_y2], fill=(25, 20, 20), outline=(255, 30, 60), width=2)

        # Walkie Talkie on Left Shoulder / Chest Strap
        radio_x1, radio_y1 = torso_left - 8, torso_top + 10
        radio_x2, radio_y2 = torso_left + 12, torso_top + 38
        if not has_walkie_violation:
            draw.rectangle([radio_x1, radio_y1, radio_x2, radio_y2], fill=(24, 26, 30), outline=(70, 75, 85))
            # Antenna
            draw.line([(radio_x1 + 4, radio_y1), (radio_x1 + 4, radio_y1 - 22)], fill=(40, 42, 48), width=3)
            # Speaker grille lines
            draw.line([(radio_x1 + 3, radio_y1 + 8), (radio_x2 - 3, radio_y1 + 8)], fill=(90, 95, 105), width=1)
            draw.line([(radio_x1 + 3, radio_y1 + 12), (radio_x2 - 3, radio_y1 + 12)], fill=(90, 95, 105), width=1)
            draw.line([(radio_x1 + 3, radio_y1 + 16), (radio_x2 - 3, radio_y1 + 16)], fill=(90, 95, 105), width=1)

    # 3. Subtle CCTV digital noise / scanline effect
    for y in range(0, H, 4):
        draw.line([(0, y), (W, y)], fill=(0, 0, 0, 30), width=1)

    # 4. Lens Vignetting
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

    # Draw Secondary Object detections (Compliant objects & equipment)
    for s in secondary_boxes:
        s_box = s["box"]
        s_label = s["label"]
        s_conf = s["confidence"]
        s_col = s.get("color", (0, 215, 255))
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

    # Top OSD Banner - Prominent Department Name and Area
    draw.rectangle([0, 0, W, 72], fill=(12, 16, 24))
    draw.line([(0, 72), (W, 72)], fill=(0, 210, 255), width=2)

    # Top Left HUD
    # Blinking RED dot
    draw.ellipse([24, 18, 38, 32], fill=(255, 30, 30))
    draw.text((46, 16), "● LIVE", fill=(255, 60, 60), font=hud_bold)
    # Clear department and area text
    dept_header_text = f"DEPARTMENT: {dept_display.upper()}  |  AREA: {camera_loc.upper()}  |  CAM: {camera_id}"
    draw.text((120, 16), dept_header_text, fill=(255, 255, 255), font=hud_bold)
    draw.text((24, 44), "1080P FHD 30FPS • H.265 RTSP • REAL-TIME YOLOv8 DETECTION", fill=(0, 220, 255), font=hud_small)

    # Top Right HUD (Timestamp & System Status)
    ts_str = timestamp.strftime("%Y-%m-%d  %H:%M:%S  PKT")
    draw.text((W - 350, 16), ts_str, fill=(255, 255, 255), font=hud_font)
    draw.text((W - 350, 44), "AI SURVEILLANCE FEED: ACTIVE", fill=(140, 210, 180), font=hud_small)

    # Center crosshair
    cx, cy = W // 2, H // 2
    draw.line([(cx - 15, cy), (cx + 15, cy)], fill=(120, 200, 255, 120), width=1)
    draw.line([(cx, cy - 15), (cx, cy + 15)], fill=(120, 200, 255, 120), width=1)

    # Bottom CCTV telemetry bar (Clean, no dummy badge)
    draw.rectangle([0, H - 36, W, H], fill=(8, 12, 16))
    draw.line([(0, H - 36), (W, H - 36)], fill=(30, 40, 50), width=1)
    draw.text((24, H - 26), "MALLSENTINEL AI VISION SYSTEM • REAL-TIME COMPLIANCE STREAM", fill=(180, 200, 220), font=hud_small)
    draw.text((W - 320, H - 26), f"LENS: 2.8mm FOV: 104° | PTZ: LOCK", fill=(160, 180, 200), font=hud_small)

    return img


# Metadata for 30 distinct records strictly targeting:
# - Bakery: Hairnet, Aprons, Gloves
# - Meat Shop: Hairnet, Protective Apron, Cut-Resistant Gloves
# - Security: Assigned Positions, Uniform Compliance, Firearm, Walkie Talkie
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
            {"label": "apron", "confidence": 0.94, "box": [430, 360, 730, 600], "color": (0, 215, 255)},
            {"label": "gloves", "confidence": 0.92, "box": [390, 460, 500, 550], "color": (0, 215, 255)},
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
        "conf": 0.91,
        "person_box": [400, 160, 800, 670],
        "person_conf": 0.95,
        "violation_box": [430, 430, 550, 520],
        "secondary": [
            {"label": "hairnet", "confidence": 0.95, "box": [520, 160, 660, 240], "color": (0, 215, 255)},
            {"label": "apron", "confidence": 0.93, "box": [450, 350, 750, 590], "color": (0, 215, 255)},
            {"label": "baking_tray", "confidence": 0.94, "box": [520, 470, 720, 560], "color": (255, 190, 0)},
        ],
        "offset_hours": 6,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Confirmed violation on morning shift. Verbal counseling given to wear food-grade gloves.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-02",
        "cam_loc": "Oven Station South",
        "emp_idx": 2,
        "violation": "No Apron",
        "severity": PenaltySeverity.medium,
        "conf": 0.90,
        "person_box": [490, 180, 850, 680],
        "person_conf": 0.94,
        "violation_box": [530, 330, 810, 580],
        "secondary": [
            {"label": "hairnet", "confidence": 0.94, "box": [590, 180, 730, 250], "color": (0, 215, 255)},
            {"label": "gloves", "confidence": 0.91, "box": [500, 450, 610, 540], "color": (0, 215, 255)},
            {"label": "commercial_oven", "confidence": 0.98, "box": [80, 120, 360, 480], "color": (255, 190, 0)},
        ],
        "offset_hours": 9,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-02",
        "cam_loc": "Oven Station South",
        "emp_idx": 1,
        "violation": "No Hairnet",
        "severity": PenaltySeverity.high,
        "conf": 0.93,
        "person_box": [360, 170, 740, 670],
        "person_conf": 0.95,
        "violation_box": [480, 170, 610, 250],
        "secondary": [
            {"label": "apron", "confidence": 0.93, "box": [410, 350, 690, 580], "color": (0, 215, 255)},
            {"label": "gloves", "confidence": 0.92, "box": [380, 440, 480, 520], "color": (0, 215, 255)},
        ],
        "offset_hours": 12,
        "status": EvidenceReviewStatus.rejected,
        "remarks": "Review showed employee stepped outside oven area to grab replacement hairnet.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-03",
        "cam_loc": "Pastry Display Counter",
        "emp_idx": 2,
        "violation": "No Gloves",
        "severity": PenaltySeverity.critical,
        "conf": 0.95,
        "person_box": [450, 160, 810, 660],
        "person_conf": 0.96,
        "violation_box": [520, 420, 650, 510],
        "secondary": [
            {"label": "hairnet", "confidence": 0.95, "box": [560, 160, 690, 240], "color": (0, 215, 255)},
            {"label": "apron", "confidence": 0.94, "box": [480, 340, 770, 570], "color": (0, 215, 255)},
            {"label": "pastry_counter", "confidence": 0.97, "box": [220, 450, 1060, 670], "color": (255, 190, 0)},
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
        "severity": PenaltySeverity.high,
        "conf": 0.96,
        "person_box": [430, 160, 790, 670],
        "person_conf": 0.96,
        "violation_box": [530, 160, 670, 250],
        "secondary": [
            {"label": "apron", "confidence": 0.93, "box": [470, 340, 750, 580], "color": (0, 215, 255)},
            {"label": "gloves", "confidence": 0.91, "box": [510, 430, 620, 520], "color": (0, 215, 255)},
        ],
        "offset_hours": 18,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Serving customers directly without hairnet. Official warning recorded.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-04",
        "cam_loc": "Dough Mixer Area",
        "emp_idx": 1,
        "violation": "No Apron",
        "severity": PenaltySeverity.medium,
        "conf": 0.89,
        "person_box": [380, 170, 760, 680],
        "person_conf": 0.93,
        "violation_box": [420, 340, 710, 590],
        "secondary": [
            {"label": "hairnet", "confidence": 0.94, "box": [490, 170, 630, 250], "color": (0, 215, 255)},
            {"label": "gloves", "confidence": 0.92, "box": [400, 460, 500, 550], "color": (0, 215, 255)},
            {"label": "dough_mixer", "confidence": 0.96, "box": [680, 260, 1080, 660], "color": (255, 190, 0)},
        ],
        "offset_hours": 21,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-04",
        "cam_loc": "Dough Mixer Area",
        "emp_idx": 1,
        "violation": "No Gloves",
        "severity": PenaltySeverity.high,
        "conf": 0.93,
        "person_box": [370, 160, 750, 670],
        "person_conf": 0.94,
        "violation_box": [410, 440, 530, 540],
        "secondary": [
            {"label": "hairnet", "confidence": 0.95, "box": [490, 160, 630, 240], "color": (0, 215, 255)},
            {"label": "apron", "confidence": 0.92, "box": [420, 340, 700, 570], "color": (0, 215, 255)},
        ],
        "offset_hours": 24,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Mixing bulk dough with bare hands. Sanitary breach confirmed.",
    },
    {
        "dept": "bakery",
        "cam_id": "CAM-BK-05",
        "cam_loc": "Packaging Line West",
        "emp_idx": 2,
        "violation": "No Hairnet",
        "severity": PenaltySeverity.high,
        "conf": 0.92,
        "person_box": [470, 180, 830, 670],
        "person_conf": 0.92,
        "violation_box": [570, 180, 710, 260],
        "secondary": [
            {"label": "apron", "confidence": 0.94, "box": [510, 350, 790, 580], "color": (0, 215, 255)},
            {"label": "gloves", "confidence": 0.93, "box": [530, 450, 640, 540], "color": (0, 215, 255)},
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
            {"label": "hairnet", "confidence": 0.95, "box": [560, 170, 680, 245], "color": (0, 215, 255)},
            {"label": "apron", "confidence": 0.93, "box": [480, 340, 770, 570], "color": (0, 215, 255)},
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
            {"label": "hairnet", "confidence": 0.94, "box": [530, 160, 670, 240], "color": (0, 215, 255)},
            {"label": "protective_apron", "confidence": 0.95, "box": [460, 340, 760, 590], "color": (0, 215, 255)},
            {"label": "cleaver_knife", "confidence": 0.96, "box": [620, 390, 750, 470], "color": (255, 190, 0)},
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
        "conf": 0.92,
        "person_box": [390, 170, 790, 670],
        "person_conf": 0.94,
        "violation_box": [510, 170, 650, 260],
        "secondary": [
            {"label": "mesh_gloves", "confidence": 0.95, "box": [440, 420, 560, 510], "color": (0, 215, 255)},
            {"label": "protective_apron", "confidence": 0.95, "box": [440, 350, 740, 590], "color": (0, 215, 255)},
        ],
        "offset_hours": 7,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Reviewed on CCTV. Hairnet fallen to collar while cutting beef. Corrected on post.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-02",
        "cam_loc": "Cold Storage Carcass Area",
        "emp_idx": 2,
        "violation": "Missing Protective Apron",
        "severity": PenaltySeverity.high,
        "conf": 0.90,
        "person_box": [440, 170, 800, 680],
        "person_conf": 0.93,
        "violation_box": [470, 320, 760, 580],
        "secondary": [
            {"label": "hairnet", "confidence": 0.94, "box": [540, 170, 670, 245], "color": (0, 215, 255)},
            {"label": "mesh_gloves", "confidence": 0.93, "box": [470, 430, 580, 520], "color": (0, 215, 255)},
            {"label": "hanging_carcass", "confidence": 0.97, "box": [140, 120, 360, 520], "color": (255, 190, 0)},
        ],
        "offset_hours": 10,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-02",
        "cam_loc": "Cold Storage Carcass Area",
        "emp_idx": 2,
        "violation": "No Gloves",
        "severity": PenaltySeverity.high,
        "conf": 0.93,
        "person_box": [460, 180, 820, 680],
        "person_conf": 0.95,
        "violation_box": [500, 430, 620, 520],
        "secondary": [
            {"label": "hairnet", "confidence": 0.95, "box": [560, 180, 700, 255], "color": (0, 215, 255)},
            {"label": "protective_apron", "confidence": 0.94, "box": [500, 340, 780, 580], "color": (0, 215, 255)},
        ],
        "offset_hours": 13,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Handling carcass cuts without hygienic barrier gloves in cold storage.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-03",
        "cam_loc": "Meat Grinder Station",
        "emp_idx": 1,
        "violation": "No Cut-Resistant Gloves",
        "severity": PenaltySeverity.critical,
        "conf": 0.95,
        "person_box": [370, 170, 760, 670],
        "person_conf": 0.95,
        "violation_box": [440, 420, 560, 510],
        "secondary": [
            {"label": "hairnet", "confidence": 0.94, "box": [490, 170, 630, 250], "color": (0, 215, 255)},
            {"label": "protective_apron", "confidence": 0.95, "box": [420, 340, 700, 580], "color": (0, 215, 255)},
            {"label": "meat_grinder", "confidence": 0.98, "box": [640, 280, 1040, 660], "color": (255, 190, 0)},
        ],
        "offset_hours": 16,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-03",
        "cam_loc": "Meat Grinder Station",
        "emp_idx": 1,
        "violation": "Missing Protective Apron",
        "severity": PenaltySeverity.high,
        "conf": 0.92,
        "person_box": [360, 160, 750, 670],
        "person_conf": 0.94,
        "violation_box": [410, 320, 700, 570],
        "secondary": [
            {"label": "hairnet", "confidence": 0.94, "box": [480, 160, 620, 240], "color": (0, 215, 255)},
            {"label": "mesh_gloves", "confidence": 0.93, "box": [430, 410, 540, 500], "color": (0, 215, 255)},
        ],
        "offset_hours": 20,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Major sanitation breach near mincer feed hopper.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-04",
        "cam_loc": "Bone Saw Cutting Station",
        "emp_idx": 2,
        "violation": "No Cut-Resistant Gloves",
        "severity": PenaltySeverity.critical,
        "conf": 0.97,
        "person_box": [400, 160, 790, 670],
        "person_conf": 0.96,
        "violation_box": [440, 430, 570, 520],
        "secondary": [
            {"label": "hairnet", "confidence": 0.95, "box": [520, 160, 660, 240], "color": (0, 215, 255)},
            {"label": "protective_apron", "confidence": 0.96, "box": [450, 330, 740, 580], "color": (0, 215, 255)},
            {"label": "bone_saw_blade", "confidence": 0.98, "box": [180, 260, 460, 630], "color": (255, 190, 0)},
        ],
        "offset_hours": 23,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-04",
        "cam_loc": "Bone Saw Cutting Station",
        "emp_idx": 2,
        "violation": "No Hairnet",
        "severity": PenaltySeverity.high,
        "conf": 0.91,
        "person_box": [420, 170, 800, 680],
        "person_conf": 0.95,
        "violation_box": [530, 170, 670, 255],
        "secondary": [
            {"label": "protective_apron", "confidence": 0.94, "box": [470, 340, 750, 590], "color": (0, 215, 255)},
            {"label": "mesh_gloves", "confidence": 0.95, "box": [460, 430, 580, 520], "color": (0, 215, 255)},
        ],
        "offset_hours": 26,
        "status": EvidenceReviewStatus.rejected,
        "remarks": "Transparent hygiene cap was on, glare from stainless blade misled initial detection.",
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-05",
        "cam_loc": "Meat Packaging Counter",
        "emp_idx": 1,
        "violation": "No Gloves",
        "severity": PenaltySeverity.high,
        "conf": 0.93,
        "person_box": [440, 180, 820, 680],
        "person_conf": 0.95,
        "violation_box": [520, 440, 650, 530],
        "secondary": [
            {"label": "hairnet", "confidence": 0.95, "box": [550, 180, 690, 255], "color": (0, 215, 255)},
            {"label": "protective_apron", "confidence": 0.93, "box": [480, 350, 770, 590], "color": (0, 215, 255)},
            {"label": "vacuum_packer", "confidence": 0.95, "box": [580, 470, 770, 560], "color": (255, 190, 0)},
        ],
        "offset_hours": 30,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "meat_shop",
        "cam_id": "CAM-MT-05",
        "cam_loc": "Meat Packaging Counter",
        "emp_idx": 2,
        "violation": "Missing Protective Apron",
        "severity": PenaltySeverity.high,
        "conf": 0.91,
        "person_box": [460, 170, 820, 670],
        "person_conf": 0.94,
        "violation_box": [490, 310, 780, 560],
        "secondary": [
            {"label": "hairnet", "confidence": 0.94, "box": [570, 170, 700, 245], "color": (0, 215, 255)},
            {"label": "gloves", "confidence": 0.93, "box": [530, 420, 640, 510], "color": (0, 215, 255)},
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
        "violation": "Left Assigned Position",
        "severity": PenaltySeverity.critical,
        "conf": 0.96,
        "person_box": [740, 210, 1040, 680],
        "person_conf": 0.96,
        "violation_box": [720, 190, 1060, 690],
        "secondary": [
            {"label": "security_uniform", "confidence": 0.95, "box": [760, 310, 1020, 580], "color": (0, 215, 255)},
            {"label": "holstered_firearm", "confidence": 0.94, "box": [940, 430, 1020, 530], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.93, "box": [780, 310, 840, 390], "color": (0, 215, 255)},
            {"label": "assigned_guard_zone", "confidence": 0.98, "box": [160, 380, 520, 660], "color": (255, 190, 0)},
        ],
        "offset_hours": 2,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-01",
        "cam_loc": "Main Mall Entrance Gate A",
        "emp_idx": 1,
        "violation": "Failed To Follow Required Uniform",
        "severity": PenaltySeverity.high,
        "conf": 0.90,
        "person_box": [420, 160, 780, 680],
        "person_conf": 0.95,
        "violation_box": [450, 280, 750, 560],
        "secondary": [
            {"label": "holstered_firearm", "confidence": 0.95, "box": [640, 430, 730, 530], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.94, "box": [450, 270, 520, 350], "color": (0, 215, 255)},
            {"label": "assigned_guard_zone", "confidence": 0.97, "box": [350, 540, 850, 680], "color": (255, 190, 0)},
        ],
        "offset_hours": 5,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Guard was missing mandatory uniform beret and regulation tie at primary mall entrance.",
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
            {"label": "security_uniform", "confidence": 0.96, "box": [470, 290, 780, 560], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.94, "box": [470, 270, 540, 350], "color": (0, 215, 255)},
            {"label": "cashier_perimeter", "confidence": 0.98, "box": [120, 100, 380, 500], "color": (255, 190, 0)},
        ],
        "offset_hours": 8,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-02",
        "cam_loc": "Cashier & Vault Perimeter",
        "emp_idx": 2,
        "violation": "Missing Required Walkie Talkie",
        "severity": PenaltySeverity.high,
        "conf": 0.93,
        "person_box": [420, 160, 790, 670],
        "person_conf": 0.95,
        "violation_box": [440, 260, 540, 360],
        "secondary": [
            {"label": "security_uniform", "confidence": 0.95, "box": [460, 290, 760, 560], "color": (0, 215, 255)},
            {"label": "holstered_firearm", "confidence": 0.96, "box": [640, 420, 740, 520], "color": (0, 215, 255)},
        ],
        "offset_hours": 11,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Guard on vault watch had left communication radio at charging dock.",
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-03",
        "cam_loc": "Rear Loading Dock & Bay",
        "emp_idx": 1,
        "violation": "Left Assigned Position",
        "severity": PenaltySeverity.critical,
        "conf": 0.97,
        "person_box": [780, 240, 1080, 670],
        "person_conf": 0.96,
        "violation_box": [760, 220, 1100, 680],
        "secondary": [
            {"label": "security_uniform", "confidence": 0.94, "box": [800, 320, 1060, 560], "color": (0, 215, 255)},
            {"label": "holstered_firearm", "confidence": 0.95, "box": [980, 430, 1060, 520], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.93, "box": [800, 310, 870, 390], "color": (0, 215, 255)},
            {"label": "loading_bay_gate", "confidence": 0.97, "box": [120, 160, 380, 580], "color": (255, 190, 0)},
        ],
        "offset_hours": 14,
        "status": EvidenceReviewStatus.approved,
        "remarks": "Loading dock left unattended for 22 minutes during scheduled delivery.",
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-03",
        "cam_loc": "Rear Loading Dock & Bay",
        "emp_idx": 1,
        "violation": "Failed To Follow Required Uniform",
        "severity": PenaltySeverity.medium,
        "conf": 0.91,
        "person_box": [440, 180, 800, 680],
        "person_conf": 0.94,
        "violation_box": [470, 310, 760, 570],
        "secondary": [
            {"label": "holstered_firearm", "confidence": 0.94, "box": [660, 430, 750, 530], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.95, "box": [470, 280, 540, 360], "color": (0, 215, 255)},
        ],
        "offset_hours": 17,
        "status": EvidenceReviewStatus.rejected,
        "remarks": "Guard had safety vest placed momentarily on chair while securing equipment harness.",
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-04",
        "cam_loc": "North Corridor Turnstiles",
        "emp_idx": 2,
        "violation": "Missing Required Firearm Equipment",
        "severity": PenaltySeverity.critical,
        "conf": 0.95,
        "person_box": [320, 200, 580, 660],
        "person_conf": 0.96,
        "violation_box": [460, 420, 560, 520],
        "secondary": [
            {"label": "security_uniform", "confidence": 0.96, "box": [350, 310, 550, 560], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.94, "box": [350, 290, 410, 370], "color": (0, 215, 255)},
            {"label": "turnstile_post", "confidence": 0.98, "box": [240, 300, 960, 680], "color": (255, 190, 0)},
        ],
        "offset_hours": 22,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-04",
        "cam_loc": "North Corridor Turnstiles",
        "emp_idx": 2,
        "violation": "Failed To Follow Required Uniform",
        "severity": PenaltySeverity.low,
        "conf": 0.88,
        "person_box": [430, 170, 800, 680],
        "person_conf": 0.93,
        "violation_box": [460, 280, 770, 560],
        "secondary": [
            {"label": "holstered_firearm", "confidence": 0.94, "box": [660, 430, 750, 530], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.95, "box": [460, 270, 530, 350], "color": (0, 215, 255)},
        ],
        "offset_hours": 25,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-05",
        "cam_loc": "Basement Parking Entry",
        "emp_idx": 1,
        "violation": "Left Assigned Position",
        "severity": PenaltySeverity.high,
        "conf": 0.94,
        "person_box": [780, 230, 1060, 680],
        "person_conf": 0.95,
        "violation_box": [750, 210, 1080, 690],
        "secondary": [
            {"label": "security_uniform", "confidence": 0.94, "box": [810, 320, 1040, 560], "color": (0, 215, 255)},
            {"label": "holstered_firearm", "confidence": 0.95, "box": [970, 430, 1050, 530], "color": (0, 215, 255)},
            {"label": "walkie_talkie", "confidence": 0.93, "box": [800, 310, 870, 380], "color": (0, 215, 255)},
            {"label": "parking_barrier_post", "confidence": 0.97, "box": [160, 360, 520, 650], "color": (255, 190, 0)},
        ],
        "offset_hours": 29,
        "status": EvidenceReviewStatus.pending,
    },
    {
        "dept": "security",
        "cam_id": "CAM-SC-05",
        "cam_loc": "Basement Parking Entry",
        "emp_idx": 2,
        "violation": "Missing Required Walkie Talkie",
        "severity": PenaltySeverity.medium,
        "conf": 0.91,
        "person_box": [420, 170, 790, 680],
        "person_conf": 0.95,
        "violation_box": [440, 260, 530, 350],
        "secondary": [
            {"label": "security_uniform", "confidence": 0.95, "box": [460, 300, 760, 560], "color": (0, 215, 255)},
            {"label": "holstered_firearm", "confidence": 0.96, "box": [640, 430, 740, 530], "color": (0, 215, 255)},
            {"label": "pedestrian_checkpoint", "confidence": 0.96, "box": [180, 380, 460, 650], "color": (255, 190, 0)},
        ],
        "offset_hours": 33,
        "status": EvidenceReviewStatus.pending,
    },
]


async def seed_cctv_evidence() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)

    async with SessionLocal() as db:
        depts_res = await db.scalars(select(Department))
        depts = {d.code: d for d in depts_res.all()}

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

        # Clear existing evidence records to replace with new compliance CCTV dataset
        await db.execute(delete(CctvEvidence))
        await db.flush()

        print("Generating 30 YOLO-style CCTV compliance evidence records and images...")

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

            # Generate realistic CCTV image with YOLO overlays and department/area headers
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
            img.save(filepath, format="JPEG", quality=92)

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

            cloud_public_id = f"mallsentinel/evidence/{dept_code}_{idx:02d}_{cfg['cam_id']}"
            image_url = f"{settings.API_PREFIX}/evidence/{record_id}/image"

            # Check Cloudinary upload if configured
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
                evidence_source="CCTV",
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
        print("Successfully generated 30 compliance CCTV evidence records and images!")

    await engine.dispose()


if __name__ == "__main__":
    import asyncio
    asyncio.run(seed_cctv_evidence())
