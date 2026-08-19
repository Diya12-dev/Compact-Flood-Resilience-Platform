"""
Stage 2 Automated Test & Verification Script

This script verifies the Drone/CV Stage 2 Video Processing Pipeline end-to-end:
1. Validates input video existence (test_video.mp4).
2. Executes DroneVideoProcessor on the test video.
3. Verifies output MP4 video file creation and readability via OpenCV.
4. Verifies frame-level detection JSON schema, sampling interval, and frame records.
"""

import json
import os
import sys
from pathlib import Path

import cv2

# Ensure parent directory is in sys.path for direct script invocation
current_dir = Path(__file__).resolve().parent
ai_dir = current_dir.parent
platform_dir = ai_dir.parent

if str(platform_dir) not in sys.path:
    sys.path.insert(0, str(platform_dir))

from ai.drone_cv.video_processor import DroneVideoProcessor


def run_stage2_test(video_path: str = None) -> bool:
    """Runs the Stage 2 video processing test and asserts expected outputs."""
    print("\n====================================================")
    print("      DRONE/CV MODULE - STAGE 2 VERIFICATION TEST    ")
    print("====================================================\n")

    # Step 1: Input video path validation
    if video_path is None:
        video_path = os.path.join(current_dir, "test_data", "videos", "test_video.mp4")

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"[Test Error] Test video file not found at: {video_path}")

    print(f"[1/4] Target input video: {video_path}")

    # Define output paths
    output_dir = os.path.join(current_dir, "test_data", "videos")
    output_video_path = os.path.join(output_dir, "annotated_test_video.mp4")
    output_json_path = os.path.join(output_dir, "video_detection_output.json")

    # Step 2: Run video processor with frame sampling stride of 5
    print("\n[2/4] Initializing DroneVideoProcessor and processing video...")
    processor = DroneVideoProcessor(model_name="yolov8n.pt", confidence_threshold=0.25)

    metadata = processor.process_video(
        video_input_path=video_path,
        output_video_path=output_video_path,
        save_json_path=output_json_path,
        frame_stride=5,
    )

    # Step 3: Verify output video artifact readability
    print("\n[3/4] Verifying generated annotated MP4 video file...")
    assert os.path.exists(output_video_path), f"Annotated MP4 file not found at: {output_video_path}"

    cap_out = cv2.VideoCapture(output_video_path)
    assert cap_out.isOpened(), f"OpenCV failed to open generated output video: {output_video_path}"

    out_frames = int(cap_out.get(cv2.CAP_PROP_FRAME_COUNT))
    out_width = int(cap_out.get(cv2.CAP_PROP_FRAME_WIDTH))
    out_height = int(cap_out.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap_out.release()

    print("✔ Output MP4 video verified successfully:")
    print(f"  - File Path: {output_video_path}")
    print(f"  - Resolution: {out_width}x{out_height}")
    print(f"  - Total Frames: {out_frames}")

    # Step 4: Verify structured JSON output schema
    print("\n[4/4] Verifying structured JSON metadata schema...")
    assert os.path.exists(output_json_path), f"Detection JSON output not found at: {output_json_path}"

    with open(output_json_path, "r", encoding="utf-8") as f:
        json_data = json.load(f)

    # Verify JSON schema keys
    required_keys = [
        "input_video_filename",
        "source_path",
        "video_dimensions",
        "fps",
        "total_frames",
        "sampling_interval",
        "processed_frames",
        "summary",
        "annotated_video_path",
        "frame_detections",
    ]
    for key in required_keys:
        assert key in json_data, f"Missing required JSON key '{key}' in output JSON"

    # Verify frame-level detections structure
    assert isinstance(json_data["frame_detections"], list), "'frame_detections' must be a list"
    assert len(json_data["frame_detections"]) == json_data["processed_frames"], (
        f"Mismatch between processed_frames ({json_data['processed_frames']}) and list length ({len(json_data['frame_detections'])})"
    )

    if len(json_data["frame_detections"]) > 0:
        sample_frame_record = json_data["frame_detections"][0]
        assert "frame_number" in sample_frame_record, "Frame record missing 'frame_number'"
        assert "timestamp_seconds" in sample_frame_record, "Frame record missing 'timestamp_seconds'"
        assert "people_count" in sample_frame_record, "Frame record missing 'people_count'"
        assert "vehicle_count" in sample_frame_record, "Frame record missing 'vehicle_count'"
        assert "detections" in sample_frame_record, "Frame record missing 'detections'"

    print("✔ Output JSON schema validated successfully:")
    print(f"  - Input Video File: {json_data['input_video_filename']}")
    print(f"  - Total Frames: {json_data['total_frames']}")
    print(f"  - Processed Sampled Frames: {json_data['processed_frames']} (sampling stride: {json_data['sampling_interval']})")
    print(f"  - Summary Detections: {json_data['summary']['total_detections_across_frames']} (People: {json_data['summary']['total_people_detections']}, Vehicles: {json_data['summary']['total_vehicle_detections']})")

    print("\n====================================================")
    print("      STAGE 2 VERIFICATION SUCCESSFUL!              ")
    print("====================================================\n")
    return True


if __name__ == "__main__":
    v_path = sys.argv[1] if len(sys.argv) > 1 else None
    success = run_stage2_test(v_path)
    sys.exit(0 if success else 1)
