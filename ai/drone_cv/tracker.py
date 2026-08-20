"""
Drone Object Tracker - Stage 3 Pipeline

This module provides persistent multi-object tracking (MOT) across video frames using
Ultralytics YOLOv8 and built-in ByteTrack (bytetrack.yaml).

It assigns and maintains persistent track IDs for detected people and vehicles across
video frames, renders annotated tracking badges (e.g. 'person ID: 3 0.92'), and
produces structured frame-level tracking JSON telemetry.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
from ultralytics import YOLO

# Ensure root platform directory is in sys.path
current_dir = Path(__file__).resolve().parent
ai_dir = current_dir.parent
platform_dir = ai_dir.parent

if str(platform_dir) not in sys.path:
    sys.path.insert(0, str(platform_dir))

# COCO Dataset Class Definitions for People & Vehicles
PERSON_CLASSES = {0: "person"}

VEHICLE_CLASSES = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

# Visual Whitelist - Only annotated classes drawn on output video (person, car, motorcycle, bus, truck)
ALLOWED_VISUAL_CLASSES = {"person", "car", "motorcycle", "bus", "truck"}

# Visual Styling - BGR Color Palettes
COLOR_PERSON = (255, 191, 0)     # Deep Sky Cyan / Amber BGR
COLOR_VEHICLE = (0, 204, 102)    # Bright Emerald Green BGR
COLOR_OTHER = (180, 180, 180)    # Light Gray BGR


class DroneObjectTracker:
    """
    Standalone object tracker for drone & aerial video monitoring feeds.
    Uses YOLOv8 with ByteTrack for persistent multi-object tracking.
    """

    def __init__(
        self,
        model_name: str = "yolov8n.pt",
        confidence_threshold: float = 0.25,
        tracker_type: str = "bytetrack.yaml",
        target_classes_only: bool = True,
    ):
        """
        Initialize object tracker with specified YOLO model and ByteTrack config.

        :param model_name: Path or name of pretrained YOLO model (default: 'yolov8n.pt')
        :param confidence_threshold: Minimum confidence score to retain detection (0.0 - 1.0)
        :param tracker_type: Tracker configuration file ('bytetrack.yaml' or 'botsort.yaml')
        :param target_classes_only: If True, filters detections to people and vehicles only
        """
        self.model_name = model_name
        self.confidence_threshold = confidence_threshold
        self.tracker_type = tracker_type
        self.target_classes_only = target_classes_only

        print(f"[DroneObjectTracker] Initializing YOLOv8 model '{model_name}' with tracker '{tracker_type}'...")
        self.model = YOLO(model_name)
        print(f"[DroneObjectTracker] Model '{model_name}' loaded successfully.")

    def track_frame(
        self,
        frame: np.ndarray,
        persist: bool = True,
        return_annotated_frame: bool = True,
    ) -> Union[Dict[str, Any], Tuple[Dict[str, Any], np.ndarray]]:
        """
        Runs object detection + persistent tracking on a single frame.

        :param frame: OpenCV BGR image array
        :param persist: Retain tracker state across consecutive frames
        :param return_annotated_frame: If True, returns tuple (metadata_dict, annotated_frame_np)
        :return: Dict containing tracking metadata (or tuple if return_annotated_frame=True)
        """
        height, width = frame.shape[:2]
        annotated_img = frame.copy()

        # Run ByteTrack tracking via Ultralytics model.track() restricted ONLY to person (0), car (2), motorcycle (3), bus (5), truck (7)
        results = self.model.track(
            source=frame,
            conf=self.confidence_threshold,
            persist=persist,
            tracker=self.tracker_type,
            classes=[0, 2, 3, 5, 7],
            verbose=False,
        )[0]

        tracks: List[Dict[str, Any]] = []
        people_count = 0
        vehicle_count = 0
        other_count = 0

        boxes = results.boxes
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())

                # Extract track ID if available from ByteTrack
                track_id = int(box.id[0].item()) if box.id is not None else None

                bbox_xyxy = box.xyxy[0].cpu().numpy().tolist()
                x1, y1, x2, y2 = [int(round(coord)) for coord in bbox_xyxy]

                class_name = self.model.names.get(class_id, f"class_{class_id}")

                # Categorize class
                if class_id in PERSON_CLASSES:
                    category = "person"
                elif class_id in VEHICLE_CLASSES:
                    category = "vehicle"
                else:
                    category = "other"

                # Strictly filter out boat, train, bicycle, and any non-whitelisted classes
                if class_name not in ALLOWED_VISUAL_CLASSES:
                    continue

                if category == "person":
                    people_count += 1
                elif category == "vehicle":
                    vehicle_count += 1
                else:
                    other_count += 1

                track_item = {
                    "track_id": track_id,
                    "class": class_name,
                    "class_id": class_id,
                    "category": category,
                    "confidence": round(confidence, 4),
                    "bbox": [x1, y1, x2, y2],
                }
                tracks.append(track_item)

                # Draw visual bounding box badge ONLY for whitelisted classes (person, car, motorcycle, bus, truck)
                if class_name in ALLOWED_VISUAL_CLASSES:
                    if track_id is not None:
                        label_text = f"{class_name} ID:{track_id} {confidence:.2f}"
                    else:
                        label_text = f"{class_name} {confidence:.2f}"

                    color = COLOR_PERSON if category == "person" else (
                        COLOR_VEHICLE if category == "vehicle" else COLOR_OTHER
                    )
                    self._draw_box_and_label(
                        annotated_img,
                        bbox=(x1, y1, x2, y2),
                        label=label_text,
                        color=color,
                    )

        frame_metadata = {
            "image_dimensions": {"width": width, "height": height},
            "summary": {
                "total_tracks": len(tracks),
                "people_count": people_count,
                "vehicle_count": vehicle_count,
                "other_count": other_count,
            },
            "tracks": tracks,
        }

        if return_annotated_frame:
            return frame_metadata, annotated_img
        return frame_metadata

    def track_video(
        self,
        video_input_path: Union[str, Path],
        output_video_path: Optional[Union[str, Path]] = None,
        save_json_path: Optional[Union[str, Path]] = None,
        frame_stride: int = 1,
    ) -> Dict[str, Any]:
        """
        Processes an MP4 video file, runs persistent ByteTrack tracking across frames,
        writes an annotated MP4 output video, and returns structured JSON telemetry.

        :param video_input_path: Path to input MP4 video file
        :param output_video_path: Output path for annotated tracking MP4 video
        :param save_json_path: Output path for tracking metadata JSON
        :param frame_stride: Frame sampling stride (default: 1 for continuous tracking)
        :return: Dict containing video tracking metadata
        """
        video_path_str = str(video_input_path)

        if not os.path.exists(video_path_str):
            raise FileNotFoundError(f"Input video file not found: {video_path_str}")

        cap = cv2.VideoCapture(video_path_str)
        if not cap.isOpened():
            raise ValueError(f"Failed to open video file: {video_path_str}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        if total_frames <= 0 or width <= 0 or height <= 0:
            cap.release()
            raise ValueError(
                f"Invalid or empty video file (resolution {width}x{height}, frames {total_frames}): {video_path_str}"
            )

        if fps <= 0 or np.isnan(fps) or fps > 120:
            fps = 30.0

        frame_stride = max(1, int(frame_stride))

        video_dir = os.path.dirname(video_path_str)
        video_basename = os.path.basename(video_path_str)
        name_without_ext = os.path.splitext(video_basename)[0]

        if output_video_path is None:
            output_video_path = os.path.join(video_dir, f"tracked_{name_without_ext}.mp4")

        if save_json_path is None:
            save_json_path = os.path.join(video_dir, f"tracking_output_{name_without_ext}.json")

        out_dir = os.path.dirname(output_video_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, (width, height))

        if not writer.isOpened():
            fourcc_fallback = cv2.VideoWriter_fourcc(*"avc1")
            writer = cv2.VideoWriter(str(output_video_path), fourcc_fallback, fps, (width, height))
            if not writer.isOpened():
                cap.release()
                raise IOError(f"Failed to initialize VideoWriter for path: {output_video_path}")

        print(f"[DroneObjectTracker] Tracking '{video_basename}' ({width}x{height} @ {fps:.2f} FPS, {total_frames} frames)...")
        print(f"[DroneObjectTracker] Sampling stride: {frame_stride} (1 = continuous tracking)")

        frame_tracks_list: List[Dict[str, Any]] = []
        processed_frames_count = 0
        total_tracked_detections = 0
        unique_track_ids = set()

        latest_annotated_frame: Optional[np.ndarray] = None
        frame_idx = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                timestamp_sec = round(frame_idx / fps, 2)
                is_sampled_frame = (frame_idx % frame_stride == 0)

                if is_sampled_frame:
                    frame_meta, annotated_frame = self.track_frame(
                        frame=frame,
                        persist=True,
                        return_annotated_frame=True,
                    )
                    latest_annotated_frame = annotated_frame
                    processed_frames_count += 1

                    ppl_count = frame_meta["summary"]["people_count"]
                    veh_count = frame_meta["summary"]["vehicle_count"]
                    tot_count = frame_meta["summary"]["total_tracks"]
                    total_tracked_detections += tot_count

                    # Track unique track IDs observed across frames
                    for item in frame_meta["tracks"]:
                        if item["track_id"] is not None:
                            unique_track_ids.add((item["category"], item["track_id"]))

                    frame_tracks_list.append({
                        "frame_number": frame_idx,
                        "timestamp_seconds": timestamp_sec,
                        "people_count": ppl_count,
                        "vehicle_count": veh_count,
                        "tracks": frame_meta["tracks"],
                    })

                    if processed_frames_count % 25 == 0:
                        print(f"  -> Tracked frame #{frame_idx}/{total_frames} ({len(unique_track_ids)} unique track IDs observed)...")
                else:
                    if latest_annotated_frame is not None:
                        annotated_frame = latest_annotated_frame
                    else:
                        annotated_frame = frame

                writer.write(annotated_frame)
                frame_idx += 1

        finally:
            cap.release()
            writer.release()

        # Group unique track ID counts by category
        people_unique_ids = len([tid for (cat, tid) in unique_track_ids if cat == "person"])
        vehicle_unique_ids = len([tid for (cat, tid) in unique_track_ids if cat == "vehicle"])

        video_tracking_metadata = {
            "input_video_filename": video_basename,
            "source_path": video_path_str,
            "video_dimensions": {
                "width": width,
                "height": height,
            },
            "fps": round(fps, 2),
            "total_frames": total_frames,
            "sampling_interval": frame_stride,
            "processed_frames": processed_frames_count,
            "summary": {
                "total_tracked_detections": total_tracked_detections,
                "unique_track_ids_observed": len(unique_track_ids),
                "people_track_ids_count": people_unique_ids,
                "vehicle_track_ids_count": vehicle_unique_ids,
            },
            "annotated_video_path": str(output_video_path),
            "frame_tracks": frame_tracks_list,
        }

        # Save JSON output
        json_dir = os.path.dirname(save_json_path)
        if json_dir:
            os.makedirs(json_dir, exist_ok=True)
        with open(save_json_path, "w", encoding="utf-8") as f:
            json.dump(video_tracking_metadata, f, indent=2)

        print(f"[DroneObjectTracker] Object tracking completed successfully!")
        print(f"  - Output Video: {output_video_path}")
        print(f"  - Tracking JSON: {save_json_path}")
        print(f"  - Observed Track IDs: {len(unique_track_ids)} total ({people_unique_ids} people, {vehicle_unique_ids} vehicles)")

        return video_tracking_metadata

    def _draw_box_and_label(
        self,
        image: np.ndarray,
        bbox: Tuple[int, int, int, int],
        label: str,
        color: Tuple[int, int, int],
        thickness: int = 2,
    ) -> None:
        """
        Draws a clean bounding box rectangle and labeled header badge on an OpenCV BGR image.
        """
        x1, y1, x2, y2 = bbox
        cv2.rectangle(image, (x1, y1), (x2, y2), color, thickness)

        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        font_thickness = 1
        (label_w, label_h), baseline = cv2.getTextSize(label, font, font_scale, font_thickness)

        text_bg_y1 = max(0, y1 - label_h - 6)
        text_bg_y2 = max(label_h + 6, y1)

        cv2.rectangle(image, (x1, text_bg_y1), (x1 + label_w + 8, text_bg_y2), color, -1)

        text_y = text_bg_y2 - 4
        cv2.putText(
            image,
            label,
            (x1 + 4, text_y),
            font,
            font_scale,
            (0, 0, 0),
            font_thickness,
            lineType=cv2.LINE_AA,
        )


def main():
    """CLI entry point for tracking objects in a video with DroneObjectTracker."""
    parser = argparse.ArgumentParser(
        description="Drone/CV Module Stage 3 - Standalone Multi-Object Tracker (ByteTrack)"
    )
    parser.add_argument(
        "--video",
        type=str,
        required=True,
        help="Path to the input MP4 video file",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Path to save the annotated tracking MP4 video file",
    )
    parser.add_argument(
        "--json",
        type=str,
        default=None,
        help="Path to save the structured tracking JSON metadata",
    )
    parser.add_argument(
        "--stride",
        type=int,
        default=1,
        help="Frame sampling stride (default: 1 for continuous tracking)",
    )
    parser.add_argument(
        "--tracker",
        type=str,
        default="bytetrack.yaml",
        help="Tracker configuration file ('bytetrack.yaml' or 'botsort.yaml')",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Confidence threshold between 0.0 and 1.0 (default: 0.25)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8n.pt",
        help="YOLO model file/name (default: yolov8n.pt)",
    )

    args = parser.parse_args()

    tracker = DroneObjectTracker(
        model_name=args.model,
        confidence_threshold=args.conf,
        tracker_type=args.tracker,
    )

    result = tracker.track_video(
        video_input_path=args.video,
        output_video_path=args.output,
        save_json_path=args.json,
        frame_stride=args.stride,
    )

    print("\n================ Tracking Results Summary ================")
    print(f"Video File           : {result['input_video_filename']}")
    print(f"Resolution           : {result['video_dimensions']['width']}x{result['video_dimensions']['height']}")
    print(f"FPS / Total Frames   : {result['fps']} FPS / {result['total_frames']} frames")
    print(f"Sampling Stride      : {result['sampling_interval']} (Processed {result['processed_frames']} frames)")
    print(f"Unique Track IDs     : {result['summary']['unique_track_ids_observed']} (People: {result['summary']['people_track_ids_count']}, Vehicles: {result['summary']['vehicle_track_ids_count']})")
    print(f"Annotated Output MP4 : {result['annotated_video_path']}")
    print(f"Tracking JSON Output : {args.json or result['input_video_filename'] + '_json'}")
    print("===========================================================\n")


if __name__ == "__main__":
    main()
