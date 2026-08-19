# Drone & Computer Vision Module (Stages 1–6)

Standalone object detection, video processing, persistent multi-object tracking (MOT), mission geotagging, mission visualization, and aerial small-object detection enhancement for the **Compact Flood Resilience Platform**.

This module provides a lightweight, modular Python detection and tracking engine powered by a pretrained **YOLOv8** model, **ByteTrack**, **OpenCV**, and simulated GPS mission geotagging & HUD visualization overlays.

---

## 📘 Beginner Concepts & Fundamentals

### 1. Object Detection vs. Object Tracking vs. Mission Geotagging vs. Visualization
* **Object Detection (Stages 1 & 2):** Identifies objects (`person`, `car`, etc.) on isolated frames independently.
* **Object Tracking (Stage 3):** Assigns a persistent **Track ID** (e.g. `person ID: 3`) to track objects across consecutive video frames as they move.
* **Mission Geotagging (Stage 4):** Interpolates simulated drone GPS waypoints based on frame timestamps and attaches the drone's observation position (`latitude`, `longitude`) to each frame.
* **Mission Visualization (Stage 5):** Renders a live telemetry HUD overlay box onto the video stream displaying frame count, video timestamp, detection tallies, simulated mission GPS position, and safety disclaimers.
* **Aerial Small-Object Detection Enhancement (Stage 6):** Enhances detection recall for tiny, distant people in aerial flood feeds by optimizing YOLO inference resolution (`imgsz=1024`).

> **CRITICAL DISTINCTION:** Stage 4 & 5 perform **mission-level geotagging only**. The GPS location represents the **drone's flight/observation position** at that timestamp, NOT the exact ground coordinate of any individual detected person or vehicle. All GPS coordinates are **SIMULATED**.

### 2. How ByteTrack & Track IDs Work
* **ByteTrack** is a state-of-the-art Multi-Object Tracking (MOT) algorithm.
* It uses a **Kalman Filter** to predict where an object will move in the next frame based on its velocity and trajectory, combined with bounding box overlap (IoU) association.
* Even if an object is briefly occluded or has a lower confidence score in a frame, ByteTrack maintains its persistent **Track ID**.

### 3. Frame Sampling in Tracking
* In Stage 2 video processing, frame sampling (`--stride N`) skipped intermediate frames.
* In Stage 3 object tracking, continuous processing (`--stride 1`, default) is used so the ByteTrack Kalman filter receives continuous motion vectors, providing high-precision track ID persistence.

### 4. Linear Interpolation & Clamping Logic (Stage 4)
* **Linear Interpolation:** For a frame timestamp $t$ between waypoints $t_1$ and $t_2$:
  $$ratio = \frac{t - t_1}{t_2 - t_1}$$
  $$lat = lat_1 + ratio \cdot (lat_2 - lat_1), \quad lon = lon_1 + ratio \cdot (lon_2 - lon_1)$$
* **Clamping Behavior:** Timestamps earlier than the first waypoint return the first waypoint location. Timestamps later than the last waypoint return the last waypoint location. No extrapolation is performed.

---

## 🛠️ Installation & Setup

```bash
cd Compact-Flood-Resilience-Platform
pip install -r requirements.txt
```

---

## 🚀 Usage Guide

### Stage 1: Image Object Detection
```bash
python -m ai.drone_cv.detector --image ai/drone_cv/test_data/sample_input.jpg --output output_annotated.jpg --json detection_results.json
python ai/drone_cv/test_stage1.py
```

### Stage 2: Video Frame-Sampling Object Detection
```bash
python -m ai.drone_cv.video_processor --video ai/drone_cv/test_data/videos/test_video.mp4 --stride 5
python ai/drone_cv/test_stage2.py
```

### Stage 3: Persistent Multi-Object Tracking (ByteTrack)
```bash
python -m ai.drone_cv.tracker --video ai/drone_cv/test_data/videos/test_video.mp4 --output tracked_output.mp4 --json tracking_output.json
python ai/drone_cv/test_stage3.py
```

### Stage 4: Mission Geotagging
```bash
python -m ai.drone_cv.geotagger \
    --tracking-json ai/drone_cv/test_data/videos/tracking_output.json \
    --waypoints ai/drone_cv/test_data/mission_gps_waypoints.json \
    --output ai/drone_cv/test_data/videos/geotagged_tracking_output.json
python ai/drone_cv/test_stage4.py
```

### Stage 5: Drone Mission Visualization
```bash
python -m ai.drone_cv.mission_visualizer \
    --video ai/drone_cv/test_data/videos/tracked_test_video.mp4 \
    --tracking-json ai/drone_cv/test_data/videos/geotagged_tracking_output.json \
    --output ai/drone_cv/test_data/videos/mission_visualization.mp4
python ai/drone_cv/test_stage5.py
```

### Stage 6: Aerial Small-Object Detection Enhancement
```bash
# Run CLI with default 1024 inference resolution
python -m ai.drone_cv.detector \
    --image ai/drone_cv/test_data/sample_input.jpg \
    --imgsz 1024 \
    --output output_enhanced.jpg \
    --json enhanced_results.json

# Run Automated Test (Runs Stage 1, Stage 2, Stage 3, Stage 4, Stage 5, and Stage 6)
python ai/drone_cv/test_stage6.py
```

---

## 🔬 Stage 6: Aerial Small-Object Detection Enhancement

### Problem Statement
In aerial drone flood feeds (such as `chennai vid.mp4`), people wading through flood waters occupy tiny bounding box areas ($\sim 15 \times 25$ pixels). Under standard 640$\times$640 inference resolution (`imgsz=640`), downsampling causes small feature representations to blur and fall below the 0.25 confidence threshold, resulting in missed human detections (40% zero-person frames in baseline).

### Configuration Comparison & Benchmark
A controlled benchmark was evaluated across **20 representative frames** of `chennai vid.mp4`:

| Configuration | Model | `imgsz` | Person Detections | Zero-Person Frames | Avg Person Conf | CPU Time / Frame | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Baseline** | `yolov8n.pt` | 640 | 28 | 8 / 20 (40%) | 0.3342 | 84.3 ms | Baseline |
| **Selected (Stage 6)** | **`yolov8n.pt`** | **1024** | **78 (+178.6%)** | **4 / 20 (20%)** | **0.4002 (+19.7%)** | **64.9 ms** | **Selected** |
| **Experiment B** | `yolov8s.pt` | 640 | 75 | 4 / 20 (20%) | 0.3768 | 65.5 ms | Rejected (False positives) |
| **Experiment C** | `yolov8n.pt` | Tiled (320) | 22 | 9 / 20 (45%) | 0.3302 | 117.9 ms | Rejected (Poor recall) |

> **IMPORTANT DISCLAIMER:** This benchmark represents **detector-output analysis**, NOT ground-truth accuracy, as no human-labeled ground-truth annotation dataset was used. Increasing `imgsz` to 1024 significantly improves small-object detection recall, but does NOT guarantee 100% detection of every person.

### Why `imgsz=1024` Was Selected
1. **+178.6% Person Detection Increase:** Human detections increased from 28 to 78 across 20 sampled frames.
2. **50% Reduction in Zero-Person Frames:** Reduced empty human detection frames from 8 down to 4.
3. **+19.7% Person Confidence Boost:** Average person confidence improved from 0.3342 to 0.4002.
4. **Stable Vehicle Counts:** Vehicle counts stayed stable (71 vs 73 baseline), avoiding the 100%+ false positive vehicle spike produced by `yolov8s`.
5. **CPU Efficiency:** Runs efficiently at 64.9 ms / frame on CPU.

### Python API Usage
```python
from ai.drone_cv.detector import DroneObjectDetector

# Instantiate with Stage 6 default (inference_size=1024)
detector = DroneObjectDetector(
    model_name="yolov8n.pt",
    confidence_threshold=0.25,
    target_classes_only=True,
    inference_size=1024  # Configurable resolution
)

# Run detection
result = detector.detect_image("path/to/aerial_frame.jpg")
```

---

## 🔒 Stage 6 Scope Boundaries & Limitations

* **Improves Recall, Not Ground-Truth Guarantee:** Higher resolution preserves spatial details for small objects, but does not guarantee detection of every individual.
* **Simulated Telemetry Overlay:** GPS positions represent drone observation locations, not ground object coordinates.
* **No SAHI / Tiled Inference Dependency:** Uses clean, native YOLO high-resolution inference without external SAHI libraries.
* **No Backend / Supabase / React Integration:** Operates strictly as a standalone CLI / Python module.
