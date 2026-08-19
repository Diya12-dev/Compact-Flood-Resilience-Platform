"""
Drone Mission Geotagger - Stage 4 Pipeline

This module provides mission-level geotagging for video tracking telemetry.
It interpolates simulated drone GPS waypoints based on frame timestamps and attaches
the drone's observation location to each frame in the Stage 3 tracking output.

NOTE: The location represents the drone's position, NOT the exact ground coordinates
of individual detected people or vehicles.
"""

import argparse
import copy
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Union


class MissionGeotagger:
    """
    Interpolates drone GPS waypoints across frame timestamps and adds
    mission-level location metadata to tracking telemetry.
    """

    def __init__(self, waypoints_input: Union[str, Path, Dict[str, Any], List[Dict[str, Any]]]):
        """
        Initialize geotagger with simulated GPS waypoints.

        :param waypoints_input: File path to JSON, or dictionary/list of waypoints
        """
        self.source_name = "simulated_mission_path"
        self.waypoints: List[Dict[str, float]] = []

        self._load_and_validate_waypoints(waypoints_input)

    def _load_and_validate_waypoints(
        self, waypoints_input: Union[str, Path, Dict[str, Any], List[Dict[str, Any]]]
    ) -> None:
        """Loads and validates waypoint structure."""
        raw_waypoints = []

        if isinstance(waypoints_input, (str, Path)):
            file_path = str(waypoints_input)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Waypoints file not found: {file_path}")
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if isinstance(data, dict):
                if "metadata" in data and isinstance(data["metadata"], dict):
                    self.source_name = data["metadata"].get("source", "simulated_mission_path")
                raw_waypoints = data.get("waypoints", [])
            elif isinstance(data, list):
                raw_waypoints = data
            else:
                raise ValueError(f"Invalid waypoints JSON format in {file_path}")

        elif isinstance(waypoints_input, dict):
            if "metadata" in waypoints_input and isinstance(waypoints_input["metadata"], dict):
                self.source_name = waypoints_input["metadata"].get("source", "simulated_mission_path")
            raw_waypoints = waypoints_input.get("waypoints", [])

        elif isinstance(waypoints_input, list):
            raw_waypoints = waypoints_input

        else:
            raise TypeError("waypoints_input must be a file path, dict, or list")

        # Validation rule 1: Waypoints must exist
        if not raw_waypoints or not isinstance(raw_waypoints, list):
            raise ValueError("Waypoints data must be a non-empty list")

        # Validation rule 2: Each waypoint must contain timestamp_seconds, latitude, longitude
        validated = []
        for idx, wp in enumerate(raw_waypoints):
            if not isinstance(wp, dict):
                raise ValueError(f"Waypoint at index {idx} must be a dictionary")
            for field in ("timestamp_seconds", "latitude", "longitude"):
                if field not in wp:
                    raise ValueError(f"Waypoint at index {idx} missing required field '{field}'")
                if not isinstance(wp[field], (int, float)):
                    raise TypeError(f"Waypoint field '{field}' at index {idx} must be numeric")

            validated.append({
                "timestamp_seconds": float(wp["timestamp_seconds"]),
                "latitude": float(wp["latitude"]),
                "longitude": float(wp["longitude"]),
            })

        # Validation rule 3: Sort waypoints by timestamp
        validated.sort(key=lambda item: item["timestamp_seconds"])

        # Remove duplicate timestamps to prevent zero-division errors during interpolation
        deduped = []
        for wp in validated:
            if not deduped or wp["timestamp_seconds"] > deduped[-1]["timestamp_seconds"]:
                deduped.append(wp)

        if not deduped:
            raise ValueError("No valid unique timestamp waypoints found after processing")

        self.waypoints = deduped

    def interpolate_location(self, timestamp_seconds: float) -> Dict[str, float]:
        """
        Linearly interpolates drone mission latitude and longitude for a given timestamp.
        Clamps to the first or last waypoint if timestamp is out of bounds.

        :param timestamp_seconds: Frame timestamp in seconds
        :return: Dict with 'latitude' and 'longitude'
        """
        t = float(timestamp_seconds)

        # Clamping before first waypoint
        if t <= self.waypoints[0]["timestamp_seconds"]:
            return {
                "latitude": round(self.waypoints[0]["latitude"], 6),
                "longitude": round(self.waypoints[0]["longitude"], 6),
            }

        # Clamping after last waypoint
        if t >= self.waypoints[-1]["timestamp_seconds"]:
            return {
                "latitude": round(self.waypoints[-1]["latitude"], 6),
                "longitude": round(self.waypoints[-1]["longitude"], 6),
            }

        # Linear interpolation between t1 and t2
        for i in range(len(self.waypoints) - 1):
            w1 = self.waypoints[i]
            w2 = self.waypoints[i + 1]

            t1, t2 = w1["timestamp_seconds"], w2["timestamp_seconds"]

            if t1 <= t <= t2:
                if t2 == t1:
                    return {
                        "latitude": round(w1["latitude"], 6),
                        "longitude": round(w1["longitude"], 6),
                    }

                ratio = (t - t1) / (t2 - t1)
                lat = w1["latitude"] + ratio * (w2["latitude"] - w1["latitude"])
                lon = w1["longitude"] + ratio * (w2["longitude"] - w1["longitude"])

                return {
                    "latitude": round(lat, 6),
                    "longitude": round(lon, 6),
                }

        # Fallback to last waypoint
        return {
            "latitude": round(self.waypoints[-1]["latitude"], 6),
            "longitude": round(self.waypoints[-1]["longitude"], 6),
        }

    def geotag_tracking_data(self, tracking_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Attaches frame-level location metadata to Stage 3 tracking data.
        Returns a NEW dictionary without mutating the input object.

        :param tracking_data: Stage 3 tracking JSON dictionary
        :return: New dictionary containing geotagged frame tracks
        """
        # Deep copy to guarantee original dictionary is untouched
        output_data = copy.deepcopy(tracking_data)

        # Add top-level geotagging metadata
        output_data["geotagging"] = {
            "gps_source": self.source_name,
            "note": "Location represents the drone mission/observation position, not the exact ground coordinate of any individual detected person or vehicle.",
        }

        # Attach mission location to each frame record
        frames_key = "frame_tracks" if "frame_tracks" in output_data else "frame_detections"

        if frames_key in output_data and isinstance(output_data[frames_key], list):
            for frame in output_data[frames_key]:
                ts = frame.get("timestamp_seconds", 0.0)
                location = self.interpolate_location(ts)
                frame["location"] = location

        return output_data

    def geotag_tracking_json(
        self,
        tracking_json_path: Union[str, Path],
        output_json_path: Union[str, Path],
    ) -> Dict[str, Any]:
        """
        Reads Stage 3 tracking JSON, applies geotagging, and saves to output file.

        :param tracking_json_path: Path to existing Stage 3 tracking JSON file
        :param output_json_path: Path to save geotagged JSON output
        :return: Geotagged tracking dictionary
        """
        track_path_str = str(tracking_json_path)
        if not os.path.exists(track_path_str):
            raise FileNotFoundError(f"Tracking JSON file not found: {track_path_str}")

        with open(track_path_str, "r", encoding="utf-8") as f:
            tracking_data = json.load(f)

        geotagged_data = self.geotag_tracking_data(tracking_data)

        out_path_str = str(output_json_path)
        out_dir = os.path.dirname(out_path_str)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        with open(out_path_str, "w", encoding="utf-8") as f:
            json.dump(geotagged_data, f, indent=2)

        print(f"[MissionGeotagger] Geotagged tracking JSON saved to: {out_path_str}")
        return geotagged_data


def main():
    """CLI entry point for MissionGeotagger."""
    parser = argparse.ArgumentParser(
        description="Drone/CV Module Stage 4 - Mission Geotagger"
    )
    parser.add_argument(
        "--tracking-json",
        type=str,
        required=True,
        help="Path to existing Stage 3 tracking JSON file",
    )
    parser.add_argument(
        "--waypoints",
        type=str,
        required=True,
        help="Path to simulated GPS waypoints JSON file",
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Path to save geotagged output JSON file",
    )

    args = parser.parse_args()

    geotagger = MissionGeotagger(args.waypoints)
    result = geotagger.geotag_tracking_json(
        tracking_json_path=args.tracking_json,
        output_json_path=args.output,
    )

    print("\n================ Geotagging Results Summary ================")
    print(f"Tracking Source  : {result.get('input_video_filename', 'N/A')}")
    print(f"GPS Source       : {result['geotagging']['gps_source']}")
    print(f"Total Frames     : {len(result.get('frame_tracks', []))}")
    print(f"Output File      : {args.output}")
    print("============================================================\n")


if __name__ == "__main__":
    main()
