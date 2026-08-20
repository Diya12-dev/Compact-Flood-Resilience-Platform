"""
Stage 3 Automated Test & Verification Script

This script verifies the entire Drone/CV Pipeline (Stages 1, 2, and 3):
1. Executes Stage 1 test (image object detection).
2. Executes Stage 2 test (video frame sampling detection).
3. Executes Stage 3 test (persistent ByteTrack object tracking on test_video.mp4).
4. Verifies output MP4 video file creation and readability via OpenCV.
5. Verifies tracking JSON metadata, schema keys, track_id presence, and track ID persistence.
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

from ai.drone_cv.test_stage1 import run_stage1_test
from ai.drone_cv.test_stage2 import run_stage2_test
from ai.drone_cv.tracker import DroneObjectTracker


def run_stage3_test(video_path: str = None) -> bool:
    """Runs Stage 1, Stage 2, and Stage 3 verification tests."""
    print("\n====================================================")
    print("      DRONE/CV MODULE - FULL REGRESSION & STAGE 3 TEST ")
    print("====================================================\n")

    # Step 1: Run Stage 1 Regression Test
    print("[1/6] Running Stage 1 Image Object Detection Regression Test...")
    stage1_ok = run_stage1_test()
    assert stage1_ok, "[Test Error] Stage 1 regression test failed!"
    print("✔ Stage 1 regression test PASSED.\n")

    # Step 2: Run Stage 2 Regression Test
    print("[2/6] Running Stage 2 Video Processing Regression Test...")
    stage2_ok = run_stage2_test()
    assert stage2_ok, "[Test Error] Stage 2 regression test failed!"
    print("✔ Stage 2 regression test PASSED.\n")

    # Step 3: Input video path validation for Stage 3
    if video_path is None:
        video_path = os.path.join(current_dir, "test_data", "videos", "test_video.mp4")

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"[Test Error] Stage 3 input video not found at: {video_path}")

    print(f"[3/6] Target Stage 3 input video: {video_path}")

    output_dir = os.path.join(current_dir, "test_data", "videos")
    output_video_path = os.path.join(output_dir, "tracked_test_video.mp4")
    output_json_path = os.path.join(output_dir, "tracking_output.json")

    # Step 4: Run Stage 3 DroneObjectTracker
    print("\n[4/6] Initializing DroneObjectTracker (ByteTrack) and tracking video...")
    tracker = DroneObjectTracker(
        model_name="yolov8n.pt",
        confidence_threshold=0.25,
        tracker_type="bytetrack.yaml",
    )

    tracking_meta = tracker.track_video(
        video_input_path=video_path,
        output_video_path=output_video_path,
        save_json_path=output_json_path,
        frame_stride=1,  # Continuous tracking for ByteTrack state accuracy
    )

    # Step 5: Verify Output Video Readability
    print("\n[5/6] Verifying generated annotated tracking MP4 video file...")
    assert os.path.exists(output_video_path), f"Tracked MP4 output file not found at: {output_video_path}"

    cap_out = cv2.VideoCapture(output_video_path)
    assert cap_out.isOpened(), f"OpenCV failed to open tracked video file: {output_video_path}"

    out_frames = int(cap_out.get(cv2.CAP_PROP_FRAME_COUNT))
    out_width = int(cap_out.get(cv2.CAP_PROP_FRAME_WIDTH))
    out_height = int(cap_out.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap_out.release()

    print("✔ Output tracking MP4 video verified successfully:")
    print(f"  - File Path: {output_video_path}")
    print(f"  - Resolution: {out_width}x{out_height}")
    print(f"  - Total Frames: {out_frames}")

    # Step 6: Verify Structured Tracking JSON Schema & Persistence
    print("\n[6/6] Verifying tracking JSON schema & track ID persistence...")
    assert os.path.exists(output_json_path), f"Tracking JSON file not found at: {output_json_path}"

    with open(output_json_path, "r", encoding="utf-8") as f:
        json_data = json.load(f)

    # Verify JSON keys
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
        "frame_tracks",
    ]
    for k in required_keys:
        assert k in json_data, f"Missing required JSON key '{k}'"

    # Verify track IDs presence in frame records
    frame_tracks = json_data["frame_tracks"]
    assert len(frame_tracks) > 0, "No frame tracks found in output JSON"

    total_track_instances = 0
    track_ids_per_frame = []

    for f_record in frame_tracks:
        assert "frame_number" in f_record, "Frame record missing 'frame_number'"
        assert "timestamp_seconds" in f_record, "Frame record missing 'timestamp_seconds'"
        assert "tracks" in f_record, "Frame record missing 'tracks'"

        frame_tids = set()
        for t_item in f_record["tracks"]:
            assert "track_id" in t_item, "Track item missing 'track_id'"
            assert "bbox" in t_item, "Track item missing 'bbox'"
            assert "confidence" in t_item, "Track item missing 'confidence'"
            assert "class" in t_item, "Track item missing 'class'"
            assert "category" in t_item, "Track item missing 'category'"

            if t_item["track_id"] is not None:
                total_track_instances += 1
                frame_tids.add(t_item["track_id"])

        track_ids_per_frame.append(frame_tids)

    # Check track ID persistence across consecutive frames
    persistent_matches = 0
    for i in range(len(track_ids_per_frame) - 1):
        common = track_ids_per_frame[i].intersection(track_ids_per_frame[i + 1])
        if len(common) > 0:
            persistent_matches += 1

    print("✔ Tracking JSON schema & track ID persistence validated:")
    print(f"  - Input Video: {json_data['input_video_filename']}")
    print(f"  - Total Frames Tracked: {json_data['processed_frames']}")
    print(f"  - Total Track Instances: {total_track_instances}")
    print(f"  - Observed Unique Track IDs: {json_data['summary']['unique_track_ids_observed']} ({json_data['summary']['people_track_ids_count']} people, {json_data['summary']['vehicle_track_ids_count']} vehicles)")
    print(f"  - Consecutive Frame Track Persistence Rate: {persistent_matches}/{len(track_ids_per_frame) - 1} frames")

    assert persistent_matches > 0, "No persistent track IDs observed across consecutive frames!"

    print("\n====================================================")
    print("      STAGE 3 VERIFICATION SUCCESSFUL!              ")
    print("====================================================\n")
    return True


if __name__ == "__main__":
    v_path = sys.argv[1] if len(sys.argv) > 1 else None
    success = run_stage3_test(v_path)
    sys.exit(0 if success else 1)
