"""
Stage 1 Automated Test & Verification Script

This script verifies the Drone/CV Stage 1 Pipeline end-to-end:
1. Validates Python environment and imports.
2. Loads/downloads the pretrained YOLOv8 model.
3. Generates or loads a sample test image.
4. Executes the DroneObjectDetector.
5. Verifies structured JSON telemetry generation.
6. Verifies annotated output image saving.
"""

import json
import os
import sys
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


def create_synthetic_sample_image(output_path: str) -> str:
    """
    Creates a clean synthetic test image containing simple visual structures
    to verify image reading, drawing, and output file saving.
    """
    # 640x480 RGB image with gradient background
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    # Sky gradient
    for y in range(240):
        img[y, :] = (230 - int(y * 0.3), 200 - int(y * 0.2), 150)

    # Road & ground surface
    img[240:, :] = (80, 80, 80)
    cv2.rectangle(img, (0, 240), (640, 250), (255, 255, 255), -1)

    # Synthetic vehicle-like rectangular shape
    cv2.rectangle(img, (100, 280), (260, 360), (40, 40, 200), -1)  # Car body
    cv2.circle(img, (140, 360), 20, (20, 20, 20), -1)              # Wheel 1
    cv2.circle(img, (220, 360), 20, (20, 20, 20), -1)              # Wheel 2

    # Synthetic person-like shape
    cv2.circle(img, (450, 260), 16, (200, 170, 150), -1)           # Head
    cv2.rectangle(img, (440, 276), (460, 340), (180, 50, 50), -1)   # Torso
    cv2.line(img, (445, 340), (445, 390), (40, 40, 120), 6)        # Leg 1
    cv2.line(img, (455, 340), (455, 390), (40, 40, 120), 6)        # Leg 2

    # Add text label
    cv2.putText(
        img,
        "Stage 1 Test Image",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2,
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, img)
    print(f"[Test Setup] Created test image: {output_path}")
    return output_path


def run_stage1_test(custom_image_path: str = None) -> bool:
    """Runs the Stage 1 pipeline test and asserts expected behavior."""
    print("\n====================================================")
    print("      DRONE/CV MODULE - STAGE 1 VERIFICATION TEST    ")
    print("====================================================\n")

    # Step 1: Input image setup
    if custom_image_path and os.path.exists(custom_image_path):
        input_image_path = custom_image_path
        print(f"[1/5] Using provided test image: {input_image_path}")
    else:
        sample_dir = os.path.join(current_dir, "test_data")
        input_image_path = os.path.join(sample_dir, "sample_input.jpg")
        create_synthetic_sample_image(input_image_path)
        print(f"[1/5] Created synthetic sample image: {input_image_path}")

    # Step 2: Initialize detector
    print("\n[2/5] Initializing DroneObjectDetector with pretrained YOLOv8...")
    output_annotated_path = os.path.join(current_dir, "test_data", "annotated_output.jpg")
    output_json_path = os.path.join(current_dir, "test_data", "detection_output.json")

    detector = DroneObjectDetector(
        model_name="yolov8n.pt",
        confidence_threshold=0.20,
        target_classes_only=False,  # Accept all classes in synthetic test
    )

    # Step 3: Run detection pipeline
    print("\n[3/5] Executing image object detection pipeline...")
    results = detector.detect_image(
        image_input=input_image_path,
        output_image_path=output_annotated_path,
        save_json_path=output_json_path,
    )

    # Step 4: Validate structured output schema
    print("\n[4/5] Verifying structured output schema...")
    assert "image" in results, "Missing 'image' key in output JSON"
    assert "image_dimensions" in results, "Missing 'image_dimensions' key in output JSON"
    assert "summary" in results, "Missing 'summary' key in output JSON"
    assert "detections" in results, "Missing 'detections' key in output JSON"

    print("✔ Output JSON structure validated successfully:")
    print(f"  - Input Image: {results['image']}")
    print(f"  - Image Dimensions: {results['image_dimensions']['width']}x{results['image_dimensions']['height']}")
    print(f"  - Total Detections: {results['summary']['total_detections']}")
    print(f"  - People Count: {results['summary']['people_count']}")
    print(f"  - Vehicle Count: {results['summary']['vehicle_count']}")

    # Step 5: Verify files were created
    print("\n[5/5] Verifying output artifacts on filesystem...")
    assert os.path.exists(output_annotated_path), f"Annotated output image not found at {output_annotated_path}"
    assert os.path.exists(output_json_path), f"Detection JSON output not found at {output_json_path}"

    print(f"✔ Annotated image saved at: {output_annotated_path}")
    print(f"✔ Detection JSON saved at: {output_json_path}")

    print("\n====================================================")
    print("      STAGE 1 VERIFICATION SUCCESSFUL!              ")
    print("====================================================\n")
    return True


if __name__ == "__main__":
    custom_img = sys.argv[1] if len(sys.argv) > 1 else None
    success = run_stage1_test(custom_img)
    sys.exit(0 if success else 1)
