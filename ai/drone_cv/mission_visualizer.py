"""
Drone Mission Visualizer - Stage 5 Pipeline

This module provides a standalone visualization component that overlays mission-level
telemetry (frame counts, timestamps, people/vehicle tallies, and simulated drone GPS coordinates)
onto the Stage 3 tracked video using Stage 4 geotagged telemetry JSON.

NOTE: The location overlay represents the drone's mission observation position, NOT
the ground coordinates of individual detected objects. GPS data is SIMULATED.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

# Ensure root platform directory is in sys.path
current_dir = Path(__file__).resolve().parent
ai_dir = current_dir.parent
platform_dir = ai_dir.parent

if str(platform_dir) not in sys.path:
    sys.path.insert(0, str(platform_dir))


class MissionVisualizer:
    """
    Overlays mission telemetry (GPS, timestamps, detection counts) onto
    tracked video streams for hackathon demonstration and visual analysis.
    """

    def __init__(
        self,
        video_path: Union[str, Path],
        tracking_json_path: Union[str, Path],
        output_path: Optional[Union[str, Path]] = None,
    ):
        """
        Initialize mission visualizer.

        :param video_path: Path to Stage 3 tracked MP4 video
        :param tracking_json_path: Path to Stage 4 geotagged tracking JSON metadata
        :param output_path: Path to save final mission visualization MP4 video
        """
        self.video_path = str(video_path)
        self.tracking_json_path = str(tracking_json_path)

        if output_path is None:
            video_dir = os.path.dirname(self.video_path)
            self.output_path = os.path.join(video_dir, "mission_visualization.mp4")
        else:
            self.output_path = str(output_path)

        # Prevent overwriting input video
        if os.path.abspath(self.video_path) == os.path.abspath(self.output_path):
            raise ValueError(f"Output path cannot be identical to input video path: {self.video_path}")

        self.geotagged_data: Dict[str, Any] = {}
        self.frame_lookup: Dict[int, Dict[str, Any]] = {}
        self._load_telemetry()

    def _load_telemetry(self) -> None:
        """Loads and indexes Stage 4 geotagged telemetry data by frame number."""
        if not os.path.exists(self.tracking_json_path):
            raise FileNotFoundError(f"Tracking JSON file not found: {self.tracking_json_path}")

        with open(self.tracking_json_path, "r", encoding="utf-8") as f:
            self.geotagged_data = json.load(f)

        # Index frame records by frame_number
        frames_key = "frame_tracks" if "frame_tracks" in self.geotagged_data else "frame_detections"
        frame_list = self.geotagged_data.get(frames_key, [])

        for f_record in frame_list:
            f_num = f_record.get("frame_number")
            if f_num is not None:
                self.frame_lookup[int(f_num)] = f_record

    def visualize(self) -> Dict[str, Any]:
        """
        Processes video frame-by-frame, renders HUD overlay, and writes output MP4 video.

        :return: Dict containing visualization summary metadata
        """
        if not os.path.exists(self.video_path):
            raise FileNotFoundError(f"Input video file not found: {self.video_path}")

        cap = cv2.VideoCapture(self.video_path)
        if not cap.isOpened():
            raise ValueError(f"Failed to open video file: {self.video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        if total_frames <= 0 or width <= 0 or height <= 0:
            cap.release()
            raise ValueError(f"Invalid video metadata ({width}x{height}, {total_frames} frames): {self.video_path}")

        if fps <= 0 or np.isnan(fps) or fps > 120:
            fps = 30.0

        out_dir = os.path.dirname(self.output_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(self.output_path, fourcc, fps, (width, height))

        if not writer.isOpened():
            fourcc_fallback = cv2.VideoWriter_fourcc(*"avc1")
            writer = cv2.VideoWriter(self.output_path, fourcc_fallback, fps, (width, height))
            if not writer.isOpened():
                cap.release()
                raise IOError(f"Failed to initialize VideoWriter for path: {self.output_path}")

        print(f"[MissionVisualizer] Rendering mission visualization for '{os.path.basename(self.video_path)}'...")
        print(f"[MissionVisualizer] Output destination: {self.output_path}")

        frame_idx = 0
        last_known_telemetry = {}

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                # Obtain telemetry for current frame
                telemetry = self.frame_lookup.get(frame_idx)
                if telemetry is None:
                    telemetry = last_known_telemetry
                else:
                    last_known_telemetry = telemetry

                # Draw telemetry HUD overlay on frame
                annotated_frame = self._render_hud_overlay(
                    frame=frame,
                    frame_idx=frame_idx,
                    total_frames=total_frames,
                    fps=fps,
                    telemetry=telemetry,
                )

                writer.write(annotated_frame)
                frame_idx += 1

                if frame_idx % 100 == 0:
                    print(f"  -> Rendered frame {frame_idx}/{total_frames}...")

        finally:
            cap.release()
            writer.release()

        summary = {
            "source_video": os.path.basename(self.video_path),
            "output_video": str(self.output_path),
            "total_frames_rendered": frame_idx,
            "resolution": {"width": width, "height": height},
            "fps": round(fps, 2),
            "gps_source": self.geotagged_data.get("geotagging", {}).get("gps_source", "simulated_mission_path"),
        }

        print(f"[MissionVisualizer] Completed mission visualization rendering successfully!")
        print(f"  - Output Video: {self.output_path}")
        return summary

    def _render_hud_overlay(
        self,
        frame: np.ndarray,
        frame_idx: int,
        total_frames: int,
        fps: float,
        telemetry: Dict[str, Any],
    ) -> np.ndarray:
        """
        Renders a clean semi-transparent HUD telemetry box on top-left of video frame.
        """
        annotated = frame.copy()
        h, w = frame.shape[:2]

        # HUD Box Dimensions (scaled for 1280x720 or 1920x1080)
        box_w = max(340, int(w * 0.32))
        box_h = 210
        margin_x, margin_y = 16, 16

        # Extract telemetry fields
        timestamp_sec = telemetry.get("timestamp_seconds", frame_idx / fps)
        ppl_count = telemetry.get("people_count", 0)
        veh_count = telemetry.get("vehicle_count", 0)

        loc = telemetry.get("location", {})
        lat = loc.get("latitude", 0.0)
        lon = loc.get("longitude", 0.0)

        mins = int(timestamp_sec // 60)
        secs = timestamp_sec % 60
        time_str = f"{mins:02d}:{secs:05.2f}"

        # Create semi-transparent overlay panel
        overlay = annotated.copy()
        cv2.rectangle(
            overlay,
            (margin_x, margin_y),
            (margin_x + box_w, margin_y + box_h),
            (15, 23, 42),  # Dark Slate BGR
            -1,
        )

        # Blend panel with alpha transparency (0.75 opacity)
        alpha = 0.78
        cv2.addWeighted(overlay, alpha, annotated, 1 - alpha, 0, annotated)

        # Draw outer border accent line (Sky Blue BGR)
        cv2.rectangle(
            annotated,
            (margin_x, margin_y),
            (margin_x + box_w, margin_y + box_h),
            (217, 119, 6),  # Dark Cyan BGR
            2,
        )

        # Header Title Badge Box
        header_h = 28
        cv2.rectangle(
            annotated,
            (margin_x, margin_y),
            (margin_x + box_w, margin_y + header_h),
            (217, 119, 6),  # Header Background
            -1,
        )

        # Typography settings
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale_head = 0.55
        font_scale_text = 0.48
        font_scale_sub = 0.40

        # Header Text
        cv2.putText(
            annotated,
            "DRONE MISSION ANALYSIS",
            (margin_x + 10, margin_y + 19),
            font,
            font_scale_head,
            (255, 255, 255),
            2,
            lineType=cv2.LINE_AA,
        )

        # Content Text Lines
        curr_y = margin_y + header_h + 22
        line_spacing = 22

        # Line 1: Frame & Time
        line1 = f"Frame: {frame_idx + 1}/{total_frames}  Time: {time_str}"
        cv2.putText(annotated, line1, (margin_x + 10, curr_y), font, font_scale_text, (226, 232, 240), 1, cv2.LINE_AA)

        # Line 2: Detection Counts
        curr_y += line_spacing
        line2 = f"PEOPLE: {ppl_count}   VEHICLES: {veh_count}"
        cv2.putText(annotated, line2, (margin_x + 10, curr_y), font, font_scale_text, (0, 255, 255), 2, cv2.LINE_AA)

        # Line 3: Mission Position Section Header
        curr_y += line_spacing
        line3 = "MISSION POSITION (Drone Location)"
        cv2.putText(annotated, line3, (margin_x + 10, curr_y), font, font_scale_text, (148, 163, 184), 1, cv2.LINE_AA)

        # Line 4: Lat & Lon Coordinates
        curr_y += line_spacing
        line4 = f"Lat: {lat:.6f}   Lon: {lon:.6f}"
        cv2.putText(annotated, line4, (margin_x + 10, curr_y), font, font_scale_text, (52, 211, 153), 2, cv2.LINE_AA)

        # Line 5: GPS Source Badge
        curr_y += line_spacing
        line5 = "GPS SOURCE: SIMULATED"
        cv2.putText(annotated, line5, (margin_x + 10, curr_y), font, font_scale_text, (0, 165, 255), 2, cv2.LINE_AA)

        # Line 6: Disclaimer Subtitle
        curr_y += 18
        disclaimer = "Drone observation position (not object ground location)"
        cv2.putText(annotated, disclaimer, (margin_x + 10, curr_y), font, font_scale_sub, (203, 213, 225), 1, cv2.LINE_AA)

        return annotated


def main():
    """CLI entry point for MissionVisualizer."""
    parser = argparse.ArgumentParser(
        description="Drone/CV Module Stage 5 - Drone Mission Visualization Overlay"
    )
    parser.add_argument(
        "--video",
        type=str,
        required=True,
        help="Path to Stage 3 tracked MP4 video file",
    )
    parser.add_argument(
        "--tracking-json",
        type=str,
        required=True,
        help="Path to Stage 4 geotagged tracking JSON file",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Path to save output mission visualization MP4 video file",
    )

    args = parser.parse_args()

    visualizer = MissionVisualizer(
        video_path=args.video,
        tracking_json_path=args.tracking_json,
        output_path=args.output,
    )

    result = visualizer.visualize()

    print("\n================ Visualization Results ================")
    print(f"Source Video     : {result['source_video']}")
    print(f"Resolution       : {result['resolution']['width']}x{result['resolution']['height']}")
    print(f"Total Rendered   : {result['total_frames_rendered']} frames @ {result['fps']} FPS")
    print(f"GPS Source       : {result['gps_source']}")
    print(f"Output Video     : {result['output_video']}")
    print("========================================================\n")


if __name__ == "__main__":
    main()
