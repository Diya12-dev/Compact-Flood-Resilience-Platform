# Drone & Computer Vision Module (Stages 1–5)

Standalone object detection, video processing, persistent multi-object tracking (MOT), mission geotagging, and mission visualization pipeline for the **Compact Flood Resilience Platform**.

This module provides a lightweight, modular Python detection and tracking engine powered by a pretrained **YOLOv8** model, **ByteTrack**, **OpenCV**, and simulated GPS mission geotagging & HUD visualization overlays.

---

## 📘 Beginner Concepts & Fundamentals

### 1. Object Detection vs. Object Tracking vs. Mission Geotagging vs. Visualization
* **Object Detection (Stages 1 & 2):** Identifies objects (`person`, `car`, etc.) on isolated frames independently.
* **Object Tracking (Stage 3):** Assigns a persistent **Track ID** (e.g. `person ID: 3`) to track objects across consecutive video frames as they move.
* **Mission Geotagging (Stage 4):** Interpolates simulated drone GPS waypoints based on frame timestamps and attaches the drone's observation position (`latitude`, `longitude`) to each frame.
* **Mission Visualization (Stage 5):** Renders a live telemetry HUD overlay box onto the video stream displaying frame count, video timestamp, detection tallies, simulated mission GPS position, and safety disclaimers.

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
# Run CLI
python -m ai.drone_cv.mission_visualizer \
    --video ai/drone_cv/test_data/videos/tracked_test_video.mp4 \
    --tracking-json ai/drone_cv/test_data/videos/geotagged_tracking_output.json \
    --output ai/drone_cv/test_data/videos/mission_visualization.mp4

# Run Automated Test (Runs Stage 1, Stage 2, Stage 3, Stage 4, and Stage 5)
python ai/drone_cv/test_stage5.py
```

#### Stage 5 CLI Arguments:
* `--video <path>` *(Required)*: Path to Stage 3 tracked MP4 video file.
* `--tracking-json <path>` *(Required)*: Path to Stage 4 geotagged tracking JSON file.
* `--output <path>` *(Required)*: Path to save final mission visualization MP4 video file.

---

## 📊 Stage 4 Geotagged Tracking JSON Schema

Stage 4 is **100% additive**; it preserves all existing Stage 3 tracking telemetry and adds top-level `geotagging` metadata and frame-level `location`:

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
    "total_tracked_detections": 9811,
    "unique_track_ids_observed": 237,
    "people_track_ids_count": 195,
    "vehicle_track_ids_count": 42
  },
  "geotagging": {
    "gps_source": "simulated_mission_path",
    "note": "Location represents the drone mission/observation position, not the exact ground coordinate of any individual detected person or vehicle."
  },
  "annotated_video_path": "ai/drone_cv/test_data/videos/tracked_test_video.mp4",
  "frame_tracks": [
    {
      "frame_number": 100,
      "timestamp_seconds": 3.34,
      "people_count": 8,
      "vehicle_count": 3,
      "location": {
        "latitude": 18.520801,
        "longitude": 73.857101
      },
      "tracks": [
        {
          "track_id": 3,
          "class": "person",
          "class_id": 0,
          "category": "person",
          "confidence": 0.912,
          "bbox": [412, 185, 458, 290]
        }
      ]
    }
  ]
}
```

---

## 🔒 Stage 5 Scope Boundaries & Limitations

* **Simulated Telemetry Overlay:** The HUD displays simulated GPS mission positions labeled as `GPS SOURCE: SIMULATED`.
* **No Object-Level Geolocation:** Overlay coordinates represent drone observation location, not ground coordinates of detected objects. Bounding boxes retain Stage 3 track ID labels (e.g. `person ID: 3`).
* **No Photogrammetry / Map APIs:** Rendered cleanly using OpenCV standard library without external mapping dependencies.
* **No Backend / Supabase / React Integration:** Operates strictly as a standalone CLI / Python module.
