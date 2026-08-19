"""
Drone Object Detector - Stage 1 Pipeline

This module provides a standalone computer vision detection pipeline powered by a
pretrained Ultralytics YOLO model and OpenCV.

It detects people and vehicles in static images, draws annotated bounding boxes,
and generates structured JSON detection telemetry.
"""

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
from ultralytics import YOLO

# COCO Dataset Class Definitions for People & Vehicles
PERSON_CLASSES = {0: "person"}

VEHICLE_CLASSES = {
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    6: "train",
    7: "truck",
    8: "boat",
}

TARGET_CLASSES = {**PERSON_CLASSES, **VEHICLE_CLASSES}

# Visual Styling - BGR Color Palettes
COLOR_PERSON = (255, 191, 0)     # Deep Sky Cyan / Amber BGR
COLOR_VEHICLE = (0, 204, 102)    # Bright Emerald Green BGR
COLOR_OTHER = (180, 180, 180)    # Light Gray BGR


class DroneObjectDetector:
    """
    Standalone object detector for drone/aerial & standard flood monitoring images.
    Uses pretrained YOLOv8 for detecting people and vehicles.
    """

    def __init__(
        self,
        model_name: str = "yolov8n.pt",
        confidence_threshold: float = 0.25,
        target_classes_only: bool = True,
        inference_size: int = 1024,
    ):
        """
        Initialize detector with specified YOLO model and confidence threshold.

        :param model_name: Path or name of pretrained YOLO model (default: 'yolov8n.pt')
        :param confidence_threshold: Minimum confidence score to retain detection (0.0 - 1.0)
        :param target_classes_only: If True, filters detections to people and vehicles only
        :param inference_size: Image size / resolution for YOLO model inference (default: 1024)
        """
        self.model_name = model_name
        self.confidence_threshold = confidence_threshold
        self.target_classes_only = target_classes_only
        self.inference_size = inference_size

        # Load pretrained model (Ultralytics handles automatic downloading if not present locally)
        print(f"[DroneObjectDetector] Loading pretrained YOLO model: {model_name} (inference size: {inference_size})...")
        self.model = YOLO(model_name)
        print(f"[DroneObjectDetector] Model '{model_name}' loaded successfully.")

    def detect_image(
        self,
        image_input: Union[str, Path, np.ndarray],
        output_image_path: Optional[Union[str, Path]] = None,
        save_json_path: Optional[Union[str, Path]] = None,
        return_annotated_image: bool = False,
    ) -> Union[Dict[str, Any], Tuple[Dict[str, Any], np.ndarray]]:
        """
        Runs object detection on an image, draws bounding boxes, and returns structured metadata.

        :param image_input: Path to local image file OR OpenCV BGR image array
        :param output_image_path: Optional output path to save annotated image
        :param save_json_path: Optional output path to save structured JSON result
        :param return_annotated_image: If True, returns tuple (structured_output, annotated_image_np)
        :return: Dict containing structured detection output (or tuple if return_annotated_image=True)
        """
        # Load image
        if isinstance(image_input, (str, Path)):
            image_path_str = str(image_input)
            if not os.path.exists(image_path_str):
                raise FileNotFoundError(f"Input image file not found: {image_path_str}")
            image_cv = cv2.imread(image_path_str)
            if image_cv is None:
                raise ValueError(f"Failed to read image from path: {image_path_str}")
        elif isinstance(image_input, np.ndarray):
            image_cv = image_input.copy()
            image_path_str = "memory_array"
        else:
            raise TypeError("image_input must be a file path (str/Path) or numpy.ndarray")

        height, width = image_cv.shape[:2]

        # Run inference with configurable resolution (Stage 6: imgsz=1024 default)
        results = self.model.predict(
            source=image_cv,
            conf=self.confidence_threshold,
            imgsz=self.inference_size,
            verbose=False,
        )[0]

        detections: List[Dict[str, Any]] = []
        people_count = 0
        vehicle_count = 0
        other_count = 0

        annotated_img = image_cv.copy()

        # Parse detections
        boxes = results.boxes
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                bbox_xyxy = box.xyxy[0].cpu().numpy().tolist()
                x1, y1, x2, y2 = [int(round(coord)) for coord in bbox_xyxy]

                class_name = self.model.names.get(class_id, f"class_{class_id}")

                # Determine category
                if class_id in PERSON_CLASSES:
                    category = "person"
                elif class_id in VEHICLE_CLASSES:
                    category = "vehicle"
                else:
                    category = "other"

                # Filter if target_classes_only is enabled
                if self.target_classes_only and category not in ("person", "vehicle"):
                    continue

                if category == "person":
                    people_count += 1
                elif category == "vehicle":
                    vehicle_count += 1
                else:
                    other_count += 1

                detection_item = {
                    "class": class_name,
                    "class_id": class_id,
                    "category": category,
                    "confidence": round(confidence, 4),
                    "bbox": [x1, y1, x2, y2],
                }
                detections.append(detection_item)

                # Draw bounding box and label on annotated image
                color = COLOR_PERSON if category == "person" else (
                    COLOR_VEHICLE if category == "vehicle" else COLOR_OTHER
                )
                self._draw_box_and_label(
                    annotated_img,
                    bbox=(x1, y1, x2, y2),
                    label=f"{class_name} {confidence:.2f}",
                    color=color,
                )

        # Build structured detection metadata
        structured_output = {
            "image": os.path.basename(image_path_str) if isinstance(image_input, (str, Path)) else "memory_image",
            "source_path": image_path_str,
            "image_dimensions": {
                "width": width,
                "height": height,
            },
            "summary": {
                "total_detections": len(detections),
                "people_count": people_count,
                "vehicle_count": vehicle_count,
                "other_count": other_count,
            },
            "detections": detections,
        }

        # Save annotated image if requested
        if output_image_path is not None:
            output_dir = os.path.dirname(output_image_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
            cv2.imwrite(str(output_image_path), annotated_img)
            structured_output["annotated_image_path"] = str(output_image_path)
            print(f"[DroneObjectDetector] Saved annotated image to: {output_image_path}")

        # Save JSON output if requested
        if save_json_path is not None:
            json_dir = os.path.dirname(save_json_path)
            if json_dir:
                os.makedirs(json_dir, exist_ok=True)
            with open(save_json_path, "w", encoding="utf-8") as f:
                json.dump(structured_output, f, indent=2)
            print(f"[DroneObjectDetector] Saved detection JSON to: {save_json_path}")

        if return_annotated_image:
            return structured_output, annotated_img
        return structured_output

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

        # Draw main bounding box
        cv2.rectangle(image, (x1, y1), (x2, y2), color, thickness)

        # Label badge setup
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        font_thickness = 1
        (label_w, label_h), baseline = cv2.getTextSize(label, font, font_scale, font_thickness)

        # Position background rectangle above or inside box
        text_bg_y1 = max(0, y1 - label_h - 6)
        text_bg_y2 = max(label_h + 6, y1)

        # Draw solid background badge for text readability
        cv2.rectangle(image, (x1, text_bg_y1), (x1 + label_w + 8, text_bg_y2), color, -1)

        # Draw text inside background badge (dark text for high contrast)
        text_y = text_bg_y2 - 4
        cv2.putText(
            image,
            label,
            (x1 + 4, text_y),
            font,
            font_scale,
            (0, 0, 0),  # Black text
            font_thickness,
            lineType=cv2.LINE_AA,
        )


def main():
    """CLI entry point for running DroneObjectDetector on a local image."""
    parser = argparse.ArgumentParser(
        description="Drone/CV Module Stage 1 - Standalone Object Detector"
    )
    parser.add_argument(
        "--image",
        type=str,
        required=True,
        help="Path to the input image file",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8n.pt",
        help="YOLO model file/name (default: yolov8n.pt)",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Confidence threshold between 0.0 and 1.0 (default: 0.25)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Path to save the annotated output image",
    )
    parser.add_argument(
        "--json",
        type=str,
        default=None,
        help="Path to save the detection JSON output",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=1024,
        help="Inference image resolution (default: 1024)",
    )
    parser.add_argument(
        "--all-classes",
        action="store_true",
        help="Detect all COCO classes, not just people and vehicles",
    )

    args = parser.parse_args()

    detector = DroneObjectDetector(
        model_name=args.model,
        confidence_threshold=args.conf,
        target_classes_only=not args.all_classes,
        inference_size=args.imgsz,
    )

    result = detector.detect_image(
        image_input=args.image,
        output_image_path=args.output,
        save_json_path=args.json,
    )

    print("\n================ Detection Results ================")
    print(json.dumps(result, indent=2))
    print("====================================================\n")


if __name__ == "__main__":
    main()
