# Drone & Computer Vision Module (Stage 1, Stage 2 & Stage 3)

Standalone object detection, video processing, and persistent multi-object tracking (MOT) pipeline for the **Compact Flood Resilience Platform**.

This module provides a lightweight, modular Python detection and tracking engine powered by a pretrained **YOLOv8** model, **ByteTrack**, and **OpenCV**. It detects and tracks people and vehicles in static images and aerial MP4 video feeds, produces annotated visual outputs, and generates structured telemetry JSON.

---

## 📘 Beginner Concepts & Fundamentals

### 1. Object Detection vs. Object Tracking
* **Object Detection (Stages 1 & 2):** Identifies objects on isolated frames independently. If a person appears in 10 consecutive frames, detection treats them as 10 unrelated person boxes without knowing they are the exact same individual.
* **Object Tracking (Stage 3):** Assigns a unique, persistent **Track ID** (e.g. `person ID: 3`, `car ID: 7`) to each detected object and follows that exact object across consecutive video frames as it moves.

### 2. How ByteTrack & Track IDs Work
* **ByteTrack** is a state-of-the-art Multi-Object Tracking (MOT) algorithm.
* It uses a **Kalman Filter** to predict where an object will move in the next frame based on its velocity and trajectory, combined with bounding box overlap (IoU) association.
* Even if an object is briefly occluded or has a lower confidence score in a frame, ByteTrack maintains its persistent **Track ID**.

### 3. Frame Sampling in Tracking
* In Stage 2 video processing, frame sampling (`--stride N`) skipped intermediate frames.
* In Stage 3 object tracking, continuous processing (`--stride 1`, default) is used so the ByteTrack Kalman filter receives continuous motion vectors, providing high-precision track ID persistence.

---

## 🛠️ Installation & Setup

```bash
cd Compact-Flood-Resilience-Platform
pip install -r requirements.txt
```

> **Note on Pretrained Weights:** `ultralytics` automatically manages model weights (`yolov8n.pt`) and tracker configs (`bytetrack.yaml`).

---

## 🚀 Usage Guide

### Stage 1: Image Object Detection
```bash
# Run CLI
python -m ai.drone_cv.detector --image ai/drone_cv/test_data/sample_input.jpg --output output_annotated.jpg --json detection_results.json

# Run Automated Test
python ai/drone_cv/test_stage1.py
```

### Stage 2: Video Frame-Sampling Object Detection
```bash
# Run CLI
python -m ai.drone_cv.video_processor --video ai/drone_cv/test_data/videos/test_video.mp4 --stride 5

# Run Automated Test
python ai/drone_cv/test_stage2.py
```

### Stage 3: Persistent Multi-Object Tracking (ByteTrack)
```bash
# Run CLI
python -m ai.drone_cv.tracker --video ai/drone_cv/test_data/videos/test_video.mp4 --output tracked_output.mp4 --json tracking_output.json

# Run Automated Test (Runs Stage 1, Stage 2, and Stage 3)
python ai/drone_cv/test_stage3.py
```

#### Stage 3 CLI Options:
* `--video <path>` *(Required)*: Path to input MP4 video.
* `--output <path>` *(Optional)*: Output tracked MP4 video path (default: `tracked_<filename>.mp4`).
* `--json <path>` *(Optional)*: Output structured tracking JSON file path.
* `--stride <int>` *(Optional)*: Frame sampling stride (default: `1` for continuous tracking).
* `--tracker <yaml>` *(Optional)*: Tracker config file (default: `bytetrack.yaml`).
* `--conf <float>` *(Optional)*: Confidence threshold (default: `0.25`).
* `--model <name>` *(Optional)*: YOLO model file (default: `yolov8n.pt`).

---

## 📊 Stage 3 Tracking JSON Schema

The object tracker outputs frame-level tracking metadata:

```json
{
  "input_video_filename": "test_video.mp4",
  "source_path": "ai/drone_cv/test_data/videos/test_video.mp4",
  "video_dimensions": {
    "width": 1280,
    "height": 720
  },
  "fps": 29.97,
  "total_frames": 704,
  "sampling_interval": 1,
  "processed_frames": 704,
  "summary": {
    "total_tracked_detections": 2450,
    "unique_track_ids_observed": 42,
    "people_track_ids_count": 30,
    "vehicle_track_ids_count": 12
  },
  "annotated_video_path": "ai/drone_cv/test_data/videos/tracked_test_video.mp4",
  "frame_tracks": [
    {
      "frame_number": 100,
      "timestamp_seconds": 3.34,
      "people_count": 4,
      "vehicle_count": 2,
      "tracks": [
        {
          "track_id": 3,
          "class": "person",
          "class_id": 0,
          "category": "person",
          "confidence": 0.912,
          "bbox": [100, 200, 150, 320]
        },
        {
          "track_id": 7,
          "class": "car",
          "class_id": 2,
          "category": "vehicle",
          "confidence": 0.845,
          "bbox": [400, 250, 550, 380]
        }
      ]
    }
  ]
}
```

---

## 🔒 Stage 3 Scope Boundaries & Current Limitations

* **No Unique Population Metric Calculation:** Stage 3 provides persistent track IDs across visible frames. Total unique population estimation (e.g. deduplicating track IDs across exit/re-entry or long occlusions) is reserved for later stages.
* **No Geolocation / GPS Mapping:** Bounding box pixel coordinates are not mapped to geographic latitude/longitude.
* **No Water / Flood / Road Segmentation:** Stage 3 tracks objects, not water levels or road boundaries.
* **No Backend / Supabase / React Integration:** Operates strictly as a standalone CLI / Python module.
