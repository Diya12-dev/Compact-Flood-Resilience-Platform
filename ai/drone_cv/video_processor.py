"""
Drone Video Processor - Stage 2 Pipeline

This module provides a standalone video-processing component for MP4 drone/aerial feeds.
It uses OpenCV VideoCapture and VideoWriter to process videos frame-by-frame, applying
the existing DroneObjectDetector on sampled frames, drawing bounding boxes, and producing
an annotated MP4 video along with structured frame-level JSON telemetry.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import cv2
import numpy as np

# Ensure root platform directory is in sys.path
current_dir = Path(__file__).resolve().parent
ai_dir = current_dir.parent
platform_dir = ai_dir.parent

if str(platform_dir) not in sys.path:
    sys.path.insert(0, str(platform_dir))

from ai.drone_cv.detector import DroneObjectDetector


class DroneVideoProcessor:
    """
    Standalone video processor for drone & aerial flood monitoring video feeds.
    Processes MP4 videos frame-by-frame with configurable frame sampling,
    reusing the existing DroneObjectDetector.
    """

    def __init__(
        self,
        detector: Optional[DroneObjectDetector] = None,
        model_name: str = "yolov8n.pt",
        confidence_threshold: float = 0.25,
    ):
        """
        Initialize video processor.

        :param detector: Optional pre-instantiated DroneObjectDetector instance
        :param model_name: YOLO model name if detector is not provided
        :param confidence_threshold: Confidence threshold if detector is not provided
        """
        if detector is not None:
            self.detector = detector
        else:
            self.detector = DroneObjectDetector(
                model_name=model_name,
                confidence_threshold=confidence_threshold,
                target_classes_only=True,
            )

    def process_video(
        self,
        video_input_path: Union[str, Path],
        output_video_path: Optional[Union[str, Path]] = None,
        save_json_path: Optional[Union[str, Path]] = None,
        frame_stride: int = 5,
    ) -> Dict[str, Any]:
        """
        Processes an MP4 video file, detects objects on sampled frames, writes an
        annotated MP4 output video, and returns structured JSON telemetry.

        :param video_input_path: Path to local input MP4 video file
        :param output_video_path: Path to save annotated output video (MP4)
        :param save_json_path: Path to save frame-level detection JSON
        :param frame_stride: Configurable frame sampling interval (e.g. process every Nth frame)
        :return: Dict containing structured video detection metadata
        """
        video_path_str = str(video_input_path)

        # 1. Error handling: Verify input file existence
        if not os.path.exists(video_path_str):
            raise FileNotFoundError(f"Input video file not found: {video_path_str}")

        # 2. Error handling: Attempt to open video stream
        cap = cv2.VideoCapture(video_path_str)
        if not cap.isOpened():
            raise ValueError(f"Failed to open video file (unsupported codec or corrupt file): {video_path_str}")

        # 3. Read video metadata
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Handle corrupt or zero-frame videos
        if total_frames <= 0 or width <= 0 or height <= 0:
            cap.release()
            raise ValueError(
                f"Invalid or empty video file (resolution: {width}x{height}, total frames: {total_frames}): {video_path_str}"
            )

        if fps <= 0 or np.isnan(fps) or fps > 120:
            fps = 30.0  # Fallback default FPS if unreadable from header

        frame_stride = max(1, int(frame_stride))

        # Default output paths if not provided
        video_dir = os.path.dirname(video_path_str)
        video_basename = os.path.basename(video_path_str)
        name_without_ext = os.path.splitext(video_basename)[0]

        if output_video_path is None:
            output_video_path = os.path.join(video_dir, f"annotated_{name_without_ext}.mp4")

        if save_json_path is None:
            save_json_path = os.path.join(video_dir, f"{name_without_ext}_detection_output.json")

        # 4. Initialize OpenCV VideoWriter
        out_dir = os.path.dirname(output_video_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        # Use mp4v fourcc codec for cross-platform MP4 compatibility
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, (width, height))

        if not writer.isOpened():
            # Fallback codec if mp4v fails
            fourcc_fallback = cv2.VideoWriter_fourcc(*"avc1")
            writer = cv2.VideoWriter(str(output_video_path), fourcc_fallback, fps, (width, height))
            if not writer.isOpened():
                cap.release()
                raise IOError(f"Failed to initialize VideoWriter for path: {output_video_path}")

        print(f"[DroneVideoProcessor] Processing '{video_basename}' ({width}x{height} @ {fps:.2f} FPS, {total_frames} frames)...")
        print(f"[DroneVideoProcessor] Frame sampling interval: process every {frame_stride} frame(s)")

        frame_detections: List[Dict[str, Any]] = []
        processed_frames_count = 0
        total_people_detections = 0
        total_vehicle_detections = 0
        total_detections_count = 0

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
                    # Run existing DroneObjectDetector on current frame
                    detection_result, annotated_frame = self.detector.detect_image(
                        image_input=frame,
                        return_annotated_image=True,
                    )
                    latest_annotated_frame = annotated_frame

                    processed_frames_count += 1
                    ppl = detection_result["summary"]["people_count"]
                    veh = detection_result["summary"]["vehicle_count"]
                    tot = detection_result["summary"]["total_detections"]

                    total_people_detections += ppl
                    total_vehicle_detections += veh
                    total_detections_count += tot

                    frame_detections.append({
                        "frame_number": frame_idx,
                        "timestamp_seconds": timestamp_sec,
                        "people_count": ppl,
                        "vehicle_count": veh,
                        "detections": detection_result["detections"],
                    })

                    if processed_frames_count % 10 == 0:
                        print(f"  -> Processed {processed_frames_count} sampled frames (Frame #{frame_idx}/{total_frames})...")
                else:
                    # For non-sampled intermediate frames, reuse latest annotated frame if available
                    if latest_annotated_frame is not None:
                        annotated_frame = latest_annotated_frame
                    else:
                        annotated_frame = frame

                # Write frame to output video stream
                writer.write(annotated_frame)
                frame_idx += 1

        finally:
            cap.release()
            writer.release()

        # Build structured video detection metadata
        video_metadata = {
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
                "total_detections_across_frames": total_detections_count,
                "total_people_detections": total_people_detections,
                "total_vehicle_detections": total_vehicle_detections,
            },
            "annotated_video_path": str(output_video_path),
            "frame_detections": frame_detections,
        }

        # Save JSON telemetry output
        json_dir = os.path.dirname(save_json_path)
        if json_dir:
            os.makedirs(json_dir, exist_ok=True)
        with open(save_json_path, "w", encoding="utf-8") as f:
            json.dump(video_metadata, f, indent=2)

        print(f"[DroneVideoProcessor] Completed video processing successfully!")
        print(f"  - Output Video: {output_video_path}")
        print(f"  - Detection JSON: {save_json_path}")

        return video_metadata


def main():
    """CLI entry point for processing a video with DroneVideoProcessor."""
    parser = argparse.ArgumentParser(
        description="Drone/CV Module Stage 2 - Standalone Video Object Processor"
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
        help="Path to save the annotated output MP4 video file",
    )
    parser.add_argument(
        "--json",
        type=str,
        default=None,
        help="Path to save the structured video detection JSON",
    )
    parser.add_argument(
        "--stride",
        type=int,
        default=5,
        help="Frame sampling stride (e.g. process every Nth frame, default: 5)",
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

    processor = DroneVideoProcessor(
        model_name=args.model,
        confidence_threshold=args.conf,
    )

    result = processor.process_video(
        video_input_path=args.video,
        output_video_path=args.output,
        save_json_path=args.json,
        frame_stride=args.stride,
    )

    print("\n================ Video Processing Results ================")
    print(f"Video File       : {result['input_video_filename']}")
    print(f"Resolution       : {result['video_dimensions']['width']}x{result['video_dimensions']['height']}")
    print(f"FPS / Total      : {result['fps']} FPS / {result['total_frames']} total frames")
    print(f"Sample Stride    : Processed {result['processed_frames']} frames (every {result['sampling_interval']}th frame)")
    print(f"Total Detections : {result['summary']['total_detections_across_frames']} (People: {result['summary']['total_people_detections']}, Vehicles: {result['summary']['total_vehicle_detections']})")
    print(f"Annotated Video  : {result['annotated_video_path']}")
    print("===========================================================\n")


if __name__ == "__main__":
    main()
