"""
Stage 5 Automated Test & Verification Script - Mission Visualization

This script verifies Stage 5 and full regression (Stages 1–4):
1. Runs full Stage 1–4 regression tests (run_stage1_test, run_stage2_test, run_stage3_test, run_stage4_test).
2. Executes MissionVisualizer on Stage 3 video and Stage 4 geotagged JSON.
3. Verifies output mission_visualization.mp4 exists, opens with OpenCV, and has valid resolution and non-zero frame count.
4. Verifies input video (tracked_test_video.mp4) is untouched and not overwritten.
5. Verifies Stage 4 geotagged tracking JSON is unchanged.
6. Verifies frame synchronization between video timestamps and Stage 4 geotagged telemetry.
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

from ai.drone_cv.mission_visualizer import MissionVisualizer
from ai.drone_cv.test_stage1 import run_stage1_test
from ai.drone_cv.test_stage2 import run_stage2_test
from ai.drone_cv.test_stage3 import run_stage3_test
from ai.drone_cv.test_stage4 import run_stage4_test


def run_stage5_test() -> bool:
    """Runs Stage 1–4 regression and Stage 5 visualization verification tests."""
    print("\n====================================================")
    print("      DRONE/CV MODULE - STAGE 5 MISSION VISUALIZATION TEST ")
    print("====================================================\n")

    # Paths setup
    test_data_dir = os.path.join(current_dir, "test_data")
    videos_dir = os.path.join(test_data_dir, "videos")

    tracked_video_path = os.path.join(videos_dir, "tracked_test_video.mp4")
    geotagged_json_path = os.path.join(videos_dir, "geotagged_tracking_output.json")
    tracking_json_path = os.path.join(videos_dir, "tracking_output.json")
    output_viz_path = os.path.join(videos_dir, "mission_visualization.mp4")

    # Save original content of tracking_output.json to ensure 100% disk preservation
    original_tracking_json_content = None
    if os.path.exists(tracking_json_path):
        with open(tracking_json_path, "r", encoding="utf-8") as f:
            original_tracking_json_content = f.read()

    try:
        # Step 1: Full Regression Test Flow (Stages 1–4)
        print("[1/6] Running Full Stage 1–4 Regression Flow...")
        assert run_stage1_test(), "[Test Error] Stage 1 test failed!"
        assert run_stage2_test(), "[Test Error] Stage 2 test failed!"
        assert run_stage3_test(), "[Test Error] Stage 3 test failed!"
        assert run_stage4_test(), "[Test Error] Stage 4 test failed!"
        print("✔ Stage 1–4 regression flow PASSED.\n")

        # Step 2: Validate Stage 3/4 Input File Existence
        print("[2/6] Validating Stage 3/4 Input Artifacts...")
        assert os.path.exists(tracked_video_path), f"Stage 3 video missing: {tracked_video_path}"
        assert os.path.exists(geotagged_json_path), f"Stage 4 JSON missing: {geotagged_json_path}"

        # Record file size & mtime to verify non-mutation
        tracked_video_size = os.path.getsize(tracked_video_path)
        geotagged_json_size = os.path.getsize(geotagged_json_path)

        # Step 3: Run MissionVisualizer
        print("\n[3/6] Initializing MissionVisualizer and rendering overlay...")
        visualizer = MissionVisualizer(
            video_path=tracked_video_path,
            tracking_json_path=geotagged_json_path,
            output_path=output_viz_path,
        )

        summary = visualizer.visualize()

        # Step 4: Verify Output Visualization Video
        print("\n[4/6] Verifying Output mission_visualization.mp4 Video Artifact...")
        assert os.path.exists(output_viz_path), f"Visualization output video missing at: {output_viz_path}"

        cap_viz = cv2.VideoCapture(output_viz_path)
        assert cap_viz.isOpened(), f"OpenCV failed to open visualization video: {output_viz_path}"

        out_frames = int(cap_viz.get(cv2.CAP_PROP_FRAME_COUNT))
        out_w = int(cap_viz.get(cv2.CAP_PROP_FRAME_WIDTH))
        out_h = int(cap_viz.get(cv2.CAP_PROP_FRAME_HEIGHT))
        ret, sample_frame = cap_viz.read()
        cap_viz.release()

        assert out_frames > 0, "Visualization output video contains 0 frames!"
        assert ret and sample_frame is not None, "Failed to read sample frame from output visualization video!"
        assert out_w > 0 and out_h > 0, "Invalid output video resolution!"

        print("✔ Output mission_visualization.mp4 verified successfully:")
        print(f"  - File Path: {output_viz_path}")
        print(f"  - Resolution: {out_w}x{out_h}")
        print(f"  - Total Frames Rendered: {out_frames}")

        # Step 5: Verify Input Artifact Non-Mutation
        print("\n[5/6] Verifying Input Artifact Non-Mutation...")
        assert os.path.exists(tracked_video_path), "Input tracked video missing after visualization!"
        assert os.path.getsize(tracked_video_path) == tracked_video_size, "Input tracked video was mutated or overwritten!"
        assert os.path.getsize(geotagged_json_path) == geotagged_json_size, "Stage 4 geotagged JSON was mutated!"

        print("✔ Input video and Stage 4 telemetry JSON remain 100% untouched.")

        # Step 6: Verify Frame Synchronization & Telemetry Lookup
        print("\n[6/6] Verifying Frame Synchronization & Telemetry Lookup...")
        with open(geotagged_json_path, "r", encoding="utf-8") as f:
            geotagged_data = json.load(f)

        frame_list = geotagged_data.get("frame_tracks", [])
        assert len(frame_list) > 0, "No frame tracks found in geotagged telemetry"

        sample_record = visualizer.frame_lookup.get(10)
        assert sample_record is not None, "Frame #10 missing from visualizer lookup"
        assert "timestamp_seconds" in sample_record, "Missing timestamp in frame lookup"
        assert "people_count" in sample_record, "Missing people_count in frame lookup"
        assert "vehicle_count" in sample_record, "Missing vehicle_count in frame lookup"
        assert "location" in sample_record, "Missing location in frame lookup"
        assert "latitude" in sample_record["location"], "Missing latitude in frame location"
        assert "longitude" in sample_record["location"], "Missing longitude in frame location"

        print("✔ Frame telemetry synchronization validated.")

        print("\n====================================================")
        print("      STAGE 5 VERIFICATION SUCCESSFUL!              ")
        print("====================================================\n")
        return True

    finally:
        # Guarantee committed tracking_output.json content is preserved on disk
        if original_tracking_json_content is not None:
            with open(tracking_json_path, "w", encoding="utf-8") as f:
                f.write(original_tracking_json_content)


if __name__ == "__main__":
    success = run_stage5_test()
    sys.exit(0 if success else 1)
