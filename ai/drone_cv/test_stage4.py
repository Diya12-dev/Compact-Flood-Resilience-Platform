"""
Stage 4 Automated Test & Verification Script - Mission Geotagging

This script verifies Stage 4 and full regression (Stages 1–3):
1. Runs full Stage 1–3 regression flow via run_stage3_test().
2. Tests MissionGeotagger interpolation and clamping correctness.
3. Tests geotagging on tracking_output.json using mission_gps_waypoints.json.
4. Verifies frame-level 'location' and top-level 'geotagging' schema.
5. Asserts EXACT preservation of all Stage 3 fields (purely additive).
6. Asserts NO object-level geolocation on individual tracks/objects.
"""

import copy
import json
import os
import sys
from pathlib import Path

# Ensure parent directory is in sys.path for direct script invocation
current_dir = Path(__file__).resolve().parent
ai_dir = current_dir.parent
platform_dir = ai_dir.parent

if str(platform_dir) not in sys.path:
    sys.path.insert(0, str(platform_dir))

from ai.drone_cv.geotagger import MissionGeotagger
from ai.drone_cv.test_stage3 import run_stage3_test


def run_stage4_test() -> bool:
    """Runs Stage 1–3 regression and Stage 4 geotagging verification tests."""
    print("\n====================================================")
    print("      DRONE/CV MODULE - STAGE 4 MISSION GEOTAGGING TEST ")
    print("====================================================\n")

    # Paths setup
    test_data_dir = os.path.join(current_dir, "test_data")
    videos_dir = os.path.join(test_data_dir, "videos")

    tracking_json_path = os.path.join(videos_dir, "tracking_output.json")
    waypoints_json_path = os.path.join(test_data_dir, "mission_gps_waypoints.json")
    output_geotagged_json_path = os.path.join(videos_dir, "geotagged_tracking_output.json")

    # Read original tracking_output.json to guarantee 100% preservation on disk
    original_tracking_json_content = None
    if os.path.exists(tracking_json_path):
        with open(tracking_json_path, "r", encoding="utf-8") as f:
            original_tracking_json_content = f.read()

    try:
        # Step A: Run Stage 1–3 Regression Flow
        print("[1/7] Running Stage 1–3 Full Regression Flow...")
        stage3_ok = run_stage3_test()
        assert stage3_ok, "[Test Error] Stage 1–3 regression test failed!"
        print("✔ Stage 1–3 regression flow PASSED.\n")

        assert os.path.exists(tracking_json_path), f"Stage 3 tracking output missing: {tracking_json_path}"
        assert os.path.exists(waypoints_json_path), f"Simulated waypoints missing: {waypoints_json_path}"

        # Step D: Test Interpolation Correctness
        print("[2/7] Testing Linear Interpolation Logic...")
        sample_waypoints = [
            {"timestamp_seconds": 0.0, "latitude": 18.5200, "longitude": 73.8500},
            {"timestamp_seconds": 10.0, "latitude": 18.5210, "longitude": 73.8510},
        ]
        geotagger_unit = MissionGeotagger(sample_waypoints)

        mid_loc = geotagger_unit.interpolate_location(5.0)
        expected_lat = 18.5205
        expected_lon = 73.8505

        assert abs(mid_loc["latitude"] - expected_lat) < 1e-5, f"Latitude interpolation error: {mid_loc}"
        assert abs(mid_loc["longitude"] - expected_lon) < 1e-5, f"Longitude interpolation error: {mid_loc}"
        print(f"✔ Interpolation at t=5.0 validated: {mid_loc}")

        # Step E: Test Clamping Before First Waypoint
        print("\n[3/7] Testing Clamping Before First Waypoint...")
        early_loc = geotagger_unit.interpolate_location(-10.0)
        assert early_loc["latitude"] == 18.5200 and early_loc["longitude"] == 73.8500, f"Clamping before first failed: {early_loc}"
        print(f"✔ Clamping at t=-10.0 validated: {early_loc}")

        # Step F: Test Clamping After Last Waypoint
        print("\n[4/7] Testing Clamping After Last Waypoint...")
        late_loc = geotagger_unit.interpolate_location(100.0)
        assert late_loc["latitude"] == 18.5210 and late_loc["longitude"] == 73.8510, f"Clamping after last failed: {late_loc}"
        print(f"✔ Clamping at t=100.0 validated: {late_loc}")

        # Step B & 4: Run Geotagger on Stage 3 Tracking Data
        print("\n[5/7] Executing MissionGeotagger on Stage 3 Tracking JSON...")
        geotagger = MissionGeotagger(waypoints_json_path)

        with open(tracking_json_path, "r", encoding="utf-8") as f:
            original_stage3_data = json.load(f)

        geotagged_data = geotagger.geotag_tracking_json(
            tracking_json_path=tracking_json_path,
            output_json_path=output_geotagged_json_path,
        )

        # Verify top-level geotagging metadata
        assert "geotagging" in geotagged_data, "Missing top-level 'geotagging' metadata"
        assert geotagged_data["geotagging"]["gps_source"] == "simulated_mission_path", "Incorrect gps_source"
        assert "note" in geotagged_data["geotagging"], "Missing geotagging note"
        print("✔ Top-level geotagging metadata verified.")

        # Verify frame-level location field presence
        frame_tracks = geotagged_data["frame_tracks"]
        assert len(frame_tracks) > 0, "No frame tracks found in geotagged JSON"

        for frame in frame_tracks:
            assert "location" in frame, f"Missing 'location' field in frame #{frame.get('frame_number')}"
            loc = frame["location"]
            assert "latitude" in loc and isinstance(loc["latitude"], float), "Invalid latitude"
            assert "longitude" in loc and isinstance(loc["longitude"], float), "Invalid longitude"

        print(f"✔ Verified frame-level location on all {len(frame_tracks)} frames.")

        # Step C: Verify Exact Stage 3 Data Preservation (Purely Additive Check)
        print("\n[6/7] Verifying Exact Stage 3 Data Preservation (Purely Additive Check)...")
        # Make a deep copy of geotagged frame tracks and remove location
        stripped_geotagged_frames = copy.deepcopy(geotagged_data["frame_tracks"])
        for f_record in stripped_geotagged_frames:
            assert "location" in f_record, "Expected location in geotagged frame"
            del f_record["location"]

        original_frames = original_stage3_data["frame_tracks"]
        assert stripped_geotagged_frames == original_frames, (
            "[Preservation Error] Geotagging mutated existing Stage 3 frame data!"
        )
        print("✔ Exact Stage 3 telemetry data preservation confirmed (100% additive).")

        # Step G: Verify NO Object-Level Geolocation
        print("\n[7/7] Verifying NO Object-Level Geolocation...")
        for frame in frame_tracks:
            for track in frame.get("tracks", []):
                assert "location" not in track, "[Violation] Found 'location' inside individual track object!"
                assert "latitude" not in track, "[Violation] Found 'latitude' inside individual track object!"
                assert "longitude" not in track, "[Violation] Found 'longitude' inside individual track object!"

        print("✔ Confirmed NO object-level geolocation exists.")

        print("\n====================================================")
        print("      STAGE 4 VERIFICATION SUCCESSFUL!              ")
        print("====================================================\n")
        return True

    finally:
        # Guarantee committed tracking_output.json content is restored on disk
        if original_tracking_json_content is not None:
            with open(tracking_json_path, "w", encoding="utf-8") as f:
                f.write(original_tracking_json_content)


if __name__ == "__main__":
    success = run_stage4_test()
    sys.exit(0 if success else 1)
