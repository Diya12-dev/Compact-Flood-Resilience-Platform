"""
Stage 6 Automated Test & Verification Script - Aerial Small-Object Detection Enhancement

This script verifies Stage 6 and full system regression (Stages 1–5):
1. Runs full Stage 1–5 regression test suite (run_stage1_test through run_stage5_test).
2. Instantiates DroneObjectDetector with default configuration and verifies inference_size == 1024.
3. Runs detection on a representative Chennai flood frame and validates output schema compatibility.
4. Confirms class filtering (people and vehicles) and absence of object-level GPS fields.
5. Runs a lightweight 5-frame detection benchmark on chennai vid.mp4.
"""

import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# Ensure parent directory is in sys.path for direct script invocation
current_dir = Path(__file__).resolve().parent
ai_dir = current_dir.parent
platform_dir = ai_dir.parent

if str(platform_dir) not in sys.path:
    sys.path.insert(0, str(platform_dir))

from ai.drone_cv.detector import DroneObjectDetector
from ai.drone_cv.test_stage1 import run_stage1_test
from ai.drone_cv.test_stage2 import run_stage2_test
from ai.drone_cv.test_stage3 import run_stage3_test
from ai.drone_cv.test_stage4 import run_stage4_test
from ai.drone_cv.test_stage5 import run_stage5_test


def run_stage6_test() -> bool:
    """Runs Stage 1–5 regression and Stage 6 detection enhancement verification tests."""
    print("\n====================================================")
    print("  DRONE/CV MODULE - STAGE 6 SMALL-OBJECT ENHANCEMENT TEST ")
    print("====================================================\n")

    test_data_dir = os.path.join(current_dir, "test_data")
    videos_dir = os.path.join(test_data_dir, "videos")
    tracking_json_path = os.path.join(videos_dir, "tracking_output.json")
    chennai_video_path = os.path.join(videos_dir, "chennai vid.mp4")

    # Save original content of tracking_output.json to ensure 100% disk preservation
    original_tracking_json_content = None
    if os.path.exists(tracking_json_path):
        with open(tracking_json_path, "r", encoding="utf-8") as f:
            original_tracking_json_content = f.read()

    try:
        # Step 1: Full Regression Test Flow (Stages 1–5)
        print("[1/8] Running Full Stage 1–5 Regression Flow...")
        assert run_stage1_test(), "[Test Error] Stage 1 test failed!"
        assert run_stage2_test(), "[Test Error] Stage 2 test failed!"
        assert run_stage3_test(), "[Test Error] Stage 3 test failed!"
        assert run_stage4_test(), "[Test Error] Stage 4 test failed!"
        assert run_stage5_test(), "[Test Error] Stage 5 test failed!"
        print("✔ Stage 1–5 full regression flow PASSED.\n")

        # Step 2: Instantiate Detector & Verify New Default Config
        print("[2/8] Instantiating DroneObjectDetector and checking default inference_size...")
        detector = DroneObjectDetector()
        assert detector.inference_size == 1024, f"[Config Error] Default inference_size is {detector.inference_size}, expected 1024!"
        assert detector.model_name == "yolov8n.pt", f"[Config Error] Default model_name is {detector.model_name}, expected yolov8n.pt!"
        assert detector.confidence_threshold == 0.25, f"[Config Error] Default confidence_threshold is {detector.confidence_threshold}, expected 0.25!"
        print(f"✔ Detector default configuration validated: model='{detector.model_name}', imgsz={detector.inference_size}, conf={detector.confidence_threshold}.")

        # Step 3: Test Single-Frame Detection Schema & Compatibility
        print("\n[3/8] Testing detection schema & backwards compatibility on sample image...")
        sample_img_path = os.path.join(test_data_dir, "sample_input.jpg")
        if not os.path.exists(sample_img_path):
            # Create synthetic test image if missing
            synthetic_img = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.rectangle(synthetic_img, (100, 100), (200, 300), (255, 255, 255), -1)
            cv2.imwrite(sample_img_path, synthetic_img)

        result = detector.detect_image(sample_img_path)
        assert "image" in result, "Missing 'image' field in detection schema"
        assert "source_path" in result, "Missing 'source_path' field in detection schema"
        assert "image_dimensions" in result, "Missing 'image_dimensions' field in detection schema"
        assert "summary" in result, "Missing 'summary' field in detection schema"
        assert "detections" in result, "Missing 'detections' field in detection schema"
        print("✔ Output detection schema validated.")

        # Step 4: Verify Class Filtering
        print("\n[4/8] Verifying person/vehicle class filtering...")
        for det in result["detections"]:
            assert det["category"] in ("person", "vehicle"), f"[Filter Error] Found non-target category: {det['category']}"
        print("✔ Person/vehicle class filtering confirmed.")

        # Step 5: Verify Absence of Object-Level GPS Fields
        print("\n[5/8] Verifying NO object-level GPS/geolocation fields exist...")
        for det in result["detections"]:
            assert "location" not in det, "[Violation] Object detection contains 'location' field!"
            assert "latitude" not in det, "[Violation] Object detection contains 'latitude' field!"
            assert "longitude" not in det, "[Violation] Object detection contains 'longitude' field!"
        print("✔ Confirmed NO object-level GPS fields exist.")

        # Step 6: Lightweight 5-Frame Chennai Video Detection Benchmark
        print("\n[6/8] Running lightweight 5-frame benchmark on Chennai video...")
        assert os.path.exists(chennai_video_path), f"Chennai video missing: {chennai_video_path}"

        cap = cv2.VideoCapture(chennai_video_path)
        assert cap.isOpened(), f"Failed to open video: {chennai_video_path}"

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        sample_indices = [int(x) for x in np.linspace(0, total_frames - 1, 5)]

        total_people = 0
        total_vehicles = 0
        inference_times = []

        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            t0 = time.time()
            frame_res = detector.detect_image(frame)
            t1 = time.time()

            total_people += frame_res["summary"]["people_count"]
            total_vehicles += frame_res["summary"]["vehicle_count"]
            inference_times.append((t1 - t0) * 1000)

        cap.release()

        avg_time_ms = np.mean(inference_times) if inference_times else 0.0
        print(f"✔ Benchmark metrics across 5 frames:")
        print(f"  - Sampled Frames     : {len(sample_indices)}")
        print(f"  - Total People Count : {total_people}")
        print(f"  - Total Vehicle Count: {total_vehicles}")
        print(f"  - Avg Inference Time : {avg_time_ms:.1f} ms / frame")

        # Step 7: Verify Custom inference_size Configuration
        print("\n[7/8] Testing explicit custom inference_size parameter...")
        custom_detector = DroneObjectDetector(inference_size=640)
        assert custom_detector.inference_size == 640, "Custom inference_size=640 failed to set!"
        print("✔ Custom inference_size configuration validated.")

        print("\n====================================================")
        print("      STAGE 6 VERIFICATION SUCCESSFUL!              ")
        print("====================================================\n")
        return True

    finally:
        # Guarantee committed tracking_output.json content is preserved on disk
        if original_tracking_json_content is not None:
            with open(tracking_json_path, "w", encoding="utf-8") as f:
                f.write(original_tracking_json_content)


if __name__ == "__main__":
    success = run_stage6_test()
    sys.exit(0 if success else 1)
