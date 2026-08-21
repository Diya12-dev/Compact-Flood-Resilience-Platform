"""
Drone CV API - FastAPI Backend Entrypoint

This API layer serves as the backend interface for the Compact Flood Resilience Platform.
It handles video upload streaming, non-blocking asynchronous Stage 2/3/4 Drone CV AI pipeline execution,
real-time WebSocket telemetry streaming (`/api/drone/stream/{mission_id}`), safe static file output retrieval
(`/api/drone/output/{filename}`), health checks, and status queries for the Drone AI Monitoring dashboard.
"""

import asyncio
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Ensure platform root directory is in sys.path for ai.drone_cv module imports
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from ai.drone_cv.geotagger import MissionGeotagger
from ai.drone_cv.video_processor import DroneVideoProcessor

app = FastAPI(
    title="Drone CV API",
    description="Backend API for Real-Time Drone AI Monitoring & Computer Vision Pipeline",
    version="1.1.0",
)

# Enable CORS for local Vite development frontend servers
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload & Output Configuration
ALLOWED_EXTENSIONS: Set[str] = {".mp4", ".webm", ".mov", ".avi"}
MAX_FILE_SIZE_BYTES: int = 500 * 1024 * 1024  # 500 MB
CHUNK_SIZE_BYTES: int = 1024 * 1024  # 1 MB chunk streaming

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "temp_uploads"
OUTPUT_DIR = BASE_DIR / "temp_outputs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

WAYPOINTS_FILE = root_dir / "ai" / "drone_cv" / "test_data" / "mission_gps_waypoints.json"

# Mount static outputs directory for direct URL video retrieval
app.mount("/static/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

# Active WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, mission_id: str, websocket: WebSocket):
        await websocket.accept()
        if mission_id not in self.active_connections:
            self.active_connections[mission_id] = []
        self.active_connections[mission_id].append(websocket)

    def disconnect(self, mission_id: str, websocket: WebSocket):
        if mission_id in self.active_connections:
            if websocket in self.active_connections[mission_id]:
                self.active_connections[mission_id].remove(websocket)
            if not self.active_connections[mission_id]:
                del self.active_connections[mission_id]

    async def broadcast_json(self, mission_id: str, data: Dict[str, Any]):
        if mission_id in self.active_connections:
            dead_sockets = []
            for ws in self.active_connections[mission_id]:
                try:
                    await ws.send_json(data)
                except Exception:
                    dead_sockets.append(ws)
            for ds in dead_sockets:
                self.disconnect(mission_id, ds)


manager = ConnectionManager()

# In-memory mission state registry
active_missions: Dict[str, Dict[str, Any]] = {}

# Shared lazy-initialized instances
_video_processor_instance: Optional[DroneVideoProcessor] = None
_geotagger_instance: Optional[MissionGeotagger] = None


def get_video_processor() -> DroneVideoProcessor:
    """Returns or lazily initializes the singleton DroneVideoProcessor instance."""
    global _video_processor_instance
    if _video_processor_instance is None:
        print("[Backend API] Initializing DroneVideoProcessor (YOLOv8 aerial object detector + ByteTrack)...")
        _video_processor_instance = DroneVideoProcessor(use_tracker=True)
        print("[Backend API] DroneVideoProcessor initialized successfully.")
    return _video_processor_instance


def get_geotagger() -> MissionGeotagger:
    """Returns or lazily initializes the singleton MissionGeotagger instance."""
    global _geotagger_instance
    if _geotagger_instance is None:
        print("[Backend API] Initializing MissionGeotagger...")
        if WAYPOINTS_FILE.exists():
            _geotagger_instance = MissionGeotagger(str(WAYPOINTS_FILE))
        else:
            default_waypoints = [
                {"timestamp_seconds": 0.0, "latitude": 18.5204, "longitude": 73.8567},
                {"timestamp_seconds": 15.0, "latitude": 18.5223, "longitude": 73.8584},
                {"timestamp_seconds": 30.0, "latitude": 18.5240, "longitude": 73.8600},
            ]
            _geotagger_instance = MissionGeotagger({
                "metadata": {"source": "simulated_mission_path"},
                "waypoints": default_waypoints,
            })
        print("[Backend API] MissionGeotagger initialized successfully.")
    return _geotagger_instance


def derive_tracks_and_events(frame_detections: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Derives tracks summary and chronological mission events from frame_detections."""
    tracks: Dict[str, Dict[str, Any]] = {}
    events: List[Dict[str, Any]] = []

    for fd in frame_detections:
        ts = float(fd.get("timestamp_seconds", 0.0))
        detections = fd.get("detections", [])

        for det in detections:
            class_name = str(det.get("class_name", "unknown")).lower()
            track_id = det.get("track_id")
            conf = float(det.get("confidence", 0.0))

            if track_id is None:
                continue

            track_key = f"{class_name}_{track_id}"

            if track_key not in tracks:
                tracks[track_key] = {
                    "track_id": track_id,
                    "class_name": class_name,
                    "first_seen": ts,
                    "last_seen": ts,
                    "confidences": [conf],
                    "observation_count": 1,
                }
                events.append({
                    "timestamp": ts,
                    "track_id": track_id,
                    "class_name": class_name,
                    "event_type": "detected",
                    "message": f"{class_name.upper()} TRACK #{track_id} DETECTED",
                })
            else:
                tr = tracks[track_key]
                tr["last_seen"] = ts
                tr["confidences"].append(conf)
                tr["observation_count"] += 1

    tracks_list = []
    for key, tr in tracks.items():
        avg_conf = round(sum(tr["confidences"]) / len(tr["confidences"]), 2) if tr["confidences"] else 0.0
        dur = round(tr["last_seen"] - tr["first_seen"], 1)
        track_obj = {
            "key": key,
            "track_id": tr["track_id"],
            "class_name": tr["class_name"],
            "confidence": avg_conf,
            "first_seen": tr["first_seen"],
            "last_seen": tr["last_seen"],
            "duration": dur,
            "observation_count": tr["observation_count"],
        }
        tracks_list.append(track_obj)

        if tr["last_seen"] > tr["first_seen"] + 2.0:
            events.append({
                "timestamp": tr["last_seen"],
                "track_id": tr["track_id"],
                "class_name": tr["class_name"],
                "event_type": "last_observed",
                "message": f"TRACK #{tr['track_id']} LAST OBSERVED",
            })

    events.sort(key=lambda e: e["timestamp"])
    return {
        "tracks": tracks_list,
        "events": events,
    }


async def run_mission_processing(mission_id: str, input_file_path: Path, output_video_path: Path, output_json_path: Path):
    """
    Background worker function that executes video processing in a thread pool,
    emitting real-time telemetry updates over WebSocket.
    """
    geotagger = get_geotagger()
    loop = asyncio.get_running_loop()

    def sync_progress_callback(cb_data: Dict[str, Any]):
        ts = cb_data.get("timestamp_seconds", 0.0)
        location = geotagger.interpolate_location(ts)

        telemetry_payload = {
            "type": "telemetry",
            "mission_id": mission_id,
            "timestamp": ts,
            "progress": cb_data.get("progress", 0),
            "people_detections": cb_data.get("people_detections", 0),
            "vehicle_detections": cb_data.get("vehicle_detections", 0),
            "total_detections": cb_data.get("total_detections", 0),
            "unique_person_tracks": cb_data.get("unique_person_tracks", 0),
            "unique_vehicle_tracks": cb_data.get("unique_vehicle_tracks", 0),
            "unique_track_ids": cb_data.get("unique_track_ids", 0),
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "status": "analyzing",
        }
        # Update active mission state
        active_missions[mission_id]["latest_telemetry"] = telemetry_payload

        # Thread-safe dispatch to WebSocket broadcast
        asyncio.run_coroutine_threadsafe(
            manager.broadcast_json(mission_id, telemetry_payload), loop
        )

    def execute_processing():
        processor = get_video_processor()
        return processor.process_video(
            video_input_path=input_file_path,
            output_video_path=output_video_path,
            save_json_path=output_json_path,
            frame_stride=5,
            progress_callback=sync_progress_callback,
        )

    try:
        vp_result = await loop.run_in_executor(None, execute_processing)

        waypoints_list = geotagger.waypoints
        start_pos = waypoints_list[0] if waypoints_list else {"latitude": 18.5204, "longitude": 73.8567}
        end_pos = waypoints_list[-1] if waypoints_list else {"latitude": 18.5240, "longitude": 73.8600}

        summary = {
            "person_detections": vp_result["summary"].get("total_people_detections", 0),
            "vehicle_detections": vp_result["summary"].get("total_vehicle_detections", 0),
            "total_detections": vp_result["summary"].get("total_detections_across_frames", 0),
            "unique_person_tracks": vp_result["summary"].get("unique_person_tracks", 0),
            "unique_vehicle_tracks": vp_result["summary"].get("unique_vehicle_tracks", 0),
            "unique_track_ids": vp_result["summary"].get("unique_track_ids", 0),
        }

        mission_telemetry = {
            "gps_source": "SIMULATED MISSION PATH",
            "start_position": {"lat": start_pos["latitude"], "lon": start_pos["longitude"]},
            "end_position": {"lat": end_pos["latitude"], "lon": end_pos["longitude"]},
            "current_position": {"lat": start_pos["latitude"], "lon": start_pos["longitude"]},
            "waypoints": [
                {"timestamp_seconds": wp["timestamp_seconds"], "lat": wp["latitude"], "lon": wp["longitude"]}
                for wp in waypoints_list
            ],
        }

        derived = derive_tracks_and_events(vp_result.get("frame_detections", []))

        completed_payload = {
            "type": "completed",
            "mission_id": mission_id,
            "status": "completed",
            "progress": 100,
            "annotated_video": output_video_path.name,
            "detection_json": output_json_path.name,
            "summary": summary,
            "mission": mission_telemetry,
            "tracks": derived["tracks"],
            "events": derived["events"],
        }

        active_missions[mission_id]["status"] = "completed"
        active_missions[mission_id]["completed_payload"] = completed_payload

        await manager.broadcast_json(mission_id, completed_payload)
        print(f"[Backend API] Mission {mission_id} processing completed successfully!")

    except Exception as e:
        print(f"[Backend API Error] Mission {mission_id} failed: {e}")
        error_payload = {
            "type": "error",
            "mission_id": mission_id,
            "status": "error",
            "message": f"AI processing failed: {str(e)}",
        }
        active_missions[mission_id]["status"] = "error"
        await manager.broadcast_json(mission_id, error_payload)


@app.get("/api/health")
def health_check():
    """Health check endpoint to verify backend server status."""
    return {
        "status": "online",
        "service": "Drone CV API",
    }


@app.get("/api/drone/status")
def drone_pipeline_status():
    """Returns backend and Drone CV pipeline readiness status."""
    return {
        "status": "online",
        "service": "Drone CV API",
        "pipeline_ready": True,
        "stages": [
            "detection",
            "tracking",
            "geotagging",
            "visualization",
            "small_object_enhancement",
        ],
    }


@app.get("/api/drone/output/{filename}")
def serve_output_file(filename: str):
    """
    Safely serves generated output files (annotated MP4 video / detection JSON)
    from backend/temp_outputs with path traversal prevention.
    """
    safe_filename = os.path.basename(filename)
    file_path = (OUTPUT_DIR / safe_filename).resolve()

    if not str(file_path).startswith(str(OUTPUT_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid file path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Requested output file not found")

    return FileResponse(file_path)


@app.post("/api/drone/upload")
async def upload_drone_video(file: UploadFile = File(...)):
    """
    Uploads an aerial surveillance video file (.mp4, .webm, .mov, .avi)
    and saves it to the temporary backend upload directory with a unique filename.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    safe_stem = re.sub(r"[^\w\-.]", "_", Path(file.filename).stem)
    unique_filename = f"{uuid.uuid4().hex[:12]}_{safe_stem}{ext}"
    file_path = UPLOAD_DIR / unique_filename

    total_bytes = 0

    try:
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(CHUNK_SIZE_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE_BYTES:
                    buffer.close()
                    if file_path.exists():
                        file_path.unlink()
                    raise HTTPException(
                        status_code=400,
                        detail="File size exceeds maximum allowed limit of 500 MB",
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    if total_bytes == 0:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    return {
        "status": "uploaded",
        "filename": unique_filename,
        "size_bytes": total_bytes,
        "message": "Video uploaded successfully",
    }


@app.post("/api/drone/process")
async def start_drone_video_process(file: UploadFile = File(...)):
    """
    Accepts an uploaded video file, streams it to backend/temp_uploads/,
    generates a mission_id, spawns background Stage 2/3/4 processing,
    and immediately returns mission_id for WebSocket telemetry streaming.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    safe_stem = re.sub(r"[^\w\-.]", "_", Path(file.filename).stem)
    mission_id = f"mission_{uuid.uuid4().hex[:12]}"
    input_filename = f"{mission_id}_{safe_stem}{ext}"
    output_video_filename = f"annotated_{mission_id}_{safe_stem}.mp4"
    output_json_filename = f"detection_{mission_id}_{safe_stem}.json"

    input_file_path = UPLOAD_DIR / input_filename
    output_video_path = OUTPUT_DIR / output_video_filename
    output_json_path = OUTPUT_DIR / output_json_filename

    total_bytes = 0

    try:
        with open(input_file_path, "wb") as buffer:
            while chunk := await file.read(CHUNK_SIZE_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE_BYTES:
                    buffer.close()
                    if input_file_path.exists():
                        input_file_path.unlink()
                    raise HTTPException(
                        status_code=400,
                        detail="File size exceeds maximum allowed limit of 500 MB",
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if input_file_path.exists():
            input_file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    if total_bytes == 0:
        if input_file_path.exists():
            input_file_path.unlink()
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Register mission in active state dict
    active_missions[mission_id] = {
        "mission_id": mission_id,
        "status": "analyzing",
        "progress": 0,
        "input_file": str(input_file_path),
        "output_video": str(output_video_path),
        "output_json": str(output_json_path),
    }

    # Spawn background non-blocking AI pipeline execution
    asyncio.create_task(
        run_mission_processing(mission_id, input_file_path, output_video_path, output_json_path)
    )

    return {
        "status": "started",
        "mission_id": mission_id,
        "message": "AI analysis started in background",
    }


@app.websocket("/api/drone/stream/{mission_id}")
async def websocket_telemetry_stream(websocket: WebSocket, mission_id: str):
    """
    WebSocket endpoint providing real-time telemetry streaming during mission video analysis.
    """
    await manager.connect(mission_id, websocket)
    try:
        # If mission has latest cached telemetry, immediately send it to newly connected socket
        if mission_id in active_missions:
            mission_data = active_missions[mission_id]
            if "latest_telemetry" in mission_data:
                await websocket.send_json(mission_data["latest_telemetry"])
            if mission_data.get("status") == "completed" and "completed_payload" in mission_data:
                await websocket.send_json(mission_data["completed_payload"])

        while True:
            # Keep connection alive until client disconnects
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(mission_id, websocket)
    except Exception:
        manager.disconnect(mission_id, websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8010, reload=True)
