# list of tables used in the database of resourcify
# all row entries are intended for maximum data collection
# we can fill the relevant columns and let other remain null - they wont affect the functionality of our website

1 - citizens
    id - uuid - primary key : Unique ID for each citizen. Used to identify the citizen across SOS alerts, rescue cases, observations, etc.
    name - text : Citizen's name.
    phone - text : Citizen's contact number for communication during rescue.
    last_known_lat - float 8 : Latitude of the citizen's most recently known location.
    last_known_lng - float 8 : Longitude of the citizen's most recently known location.
    created_at - timestamptz : When the citizen record was first created.
    updated_at - timestamptz : When the citizen's information/location was last updated.

2 - drone_detections [Stores individual things detected by the drone.]
    id - primary key - uuid : Unique ID for this drone detection.
    lat - float 8 : Latitude where the drone detected something.
    lng - float 8 : Longitude where the drone detected something.
    observation_type - text : What the drone detected, e.g. person, submerged_vehicle, blocked_road, flooded_area.
    confidence - float8 : AI/model confidence in the detection, e.g. 0.94.
    created_at - timestamptz : When the detection was recorded.
    mission_id - uuid - foreign key  -> drone_mission.id : Links this detection to the drone mission/video from which it came.
    road_id - uuid - foreign key -> road_segments.id : Links the detection to a particular road if it concerns a road.
    incident_id - uuid - foreign key -> incidents.id : Links the detection to the larger incident generated/updated from it.
    source - text : Source of the detection, e.g. drone_yolov8, manual_drone_review.
    evidence_ref-text : Reference to supporting evidence, such as a video filename, frame ID, image URL/path, etc.

3 - drone_missions [Represents one drone deployment/flight/video mission]
    id - primary key - uuid : Unique ID for the drone mission.
    mission_code -text : Human-readable mission identifier, e.g. DRONE-PUNE-001.
    video_reference -text : Location/reference of the drone video being analyzed.
    area_lat - float 8 : Latitude representing the mission's target/central area.
    area_lng - float 8 : Longitude representing the mission's target/central area.
    created_at - timestamptz : When the mission was recorded/created.

4 - flood_zones [Stores predefined flood-risk geographical areas.]
    id - primary key - uuid : Unique ID for the flood zone.
    geojson_polygon - jsonb : Polygon defining the actual geographical boundary of the flood-risk zone.
    severity - text : Flood severity classification, e.g. low, moderate, high, critical.
    created_at - timestamptz : When this flood-zone record was created.
    ward_name - text : Name of the Pune ward/area covered by the zone.
    risk_score - numeric : Numerical flood-risk score calculated from factors such as historical flooding, rainfall, elevation, drainage, etc.
    updated_at - timestamptz: When the flood-zone information was last updated.


5 - incidents [An incident represents a meaningful disaster event that the system needs to track.]
    id - primary key - uuid : Unique ID for the incident.
    type - text: Type of incident, e.g. flooded_road, person_stranded, vehicle_submerged, infrastructure_damage.
    lat - float 8: Latitude of the incident.
    lng - float 8: Longitude of the incident.
    severity - text: Importance/danger level, e.g. low, medium, high, critical.
    confidence - float8 :Confidence that the incident is genuine/correctly classified.
    status - text :Current state, e.g. detected, verified, responding, resolved.
    created_at - timestamptz: When the incident was first recorded.
    updated_at - timestamptz: When the incident was last updated.

6 -  observations [This is your general evidence/observation table. It lets different sources report information about the same incident.]
    id - primary key - uuid : Unique ID for the observation.	
    source - text : Where the observation came from, e.g. drone, citizen, operator, sensor.
    observation_type - text : What was observed, e.g. flooded_road, stranded_person, water_level_high.
    lat - float 8: Latitude of the observation.
    lng - float 8:Longitude of the observation.
    confidence - float8: Confidence/reliability of the observation.
    evidence_ref-text: Supporting evidence such as photo, video, audio, drone frame, etc.
    incident_id - uuid - foreign key -> incidents.id :Incident that this observation supports/reports.
    citizen_id - uuid - foreign key -> citizens.id :Citizen who submitted the observation, if applicable.
    sos_id - uuid - foreign key -> sos_alerts.id :SOS alert associated with the observation, if applicable.
    road_id - uuid - foreign key ->road_segments.id :Road associated with the observation, if applicable.
    created_at - timestamptz : When the observation was recorded/submitted.
	

7 - rescue_cases [Represents an actual rescue operation/case.]
    id - primary key - uuid : Unique ID for the rescue case.
    citizen_id - uuid - foreign key -> citizens.id : Citizen who needs assistance.
    sos_id - uuid - foreign key -> sos_alerts.id : SOS alert that triggered the rescue case.
    volunteer_id - uuid - foreign key -> volunteers.id : Volunteer assigned to handle the rescue.
    status- text : Current rescue state, e.g. pending, assigned, in_progress, rescued, cancelled.
    created_at - timestamptz : When the rescue case was created.
    updated_at - timestamptz : When its information was last updated.
    incident_id - uuid - foreign key -> incidents.id : Incident associated with this rescue.
    resource_id - uuid - foreign key -> resources.id :Resource being used/assigned for the rescue, e.g. boat, emergency vehicle, medical team.

8 - rescue_status_history [Stores the timeline of a rescue case.]
    id - primary key - uuid : Unique ID for this status-history entry.
    rescue_case_id - uuid - foreign key -> rescue_cases.id : Rescue case whose status changed.
    status - text : Status at this point in time.
    notes - text : Additional information about the status change.
    created_at - timestamptz : When this status update happened.
    
9 - resources [Represents physical/emergency resources available for disaster response.]
    id - primary key - uuid : Unique resource ID.
    type - text : Resource type, e.g. boat, ambulance, rescue_vehicle, medical_team.
    lat - float 8 :
    lng - float 8 :
    available - boolean : Whether the resource is currently available for assignment.
    capacity - int4 : Number of people the resource can accommodate/handle.
    created_at - timestamptz : When the resource was registered.

10 - road_segments [Represents individual roads/road sections monitored by your system.]
    id - primary key - uuid : Unique ID for the road segment.
    name - text : Road/street name.
    start_lat - float 8 :
    start_lng - float 8 :
    end_lat - float 8 :
    end_lng - float 8 :
    status - text : Current road condition, e.g. open, flooded, blocked, unsafe.
    confidence - float8 :Confidence in the current road-status information.
    last_observed_at timestamptz : When the road was most recently observed/updated.
    created_at - timestamptz : When the road segment was added to the database.

11 - shelter_checkins   [Tracks which citizens reached which shelters.]
    id - primary key - uuid : Unique check-in record ID.
    citizen_id - uuid - foreign key  -> citizens.id : Citizen who checked in.
    shelter_id - uuid - foreign key -> shelters.id : Shelter where the citizen checked in.
    check_in_time - timestamptz :Time the citizen arrived.
    check_out_time - timestamptz : Time the citizen left. Can remain NULL while still there.
    rescue_case_id - uuid - foreign key -> rescue_cases.id : Rescue case that brought the citizen to the shelter, if applicable.

12 - shelters [Stores emergency shelter information.]
    id - primary key - uuid : Unique shelter ID.
    name - text
    lat - float 8
    lng - float 8
    capacity - int4 : Maximum number of people the shelter can accommodate.
    contact - text: Contact number/details for the shelter.
    status - text: Current state, e.g. open, closed, full, emergency_only.
    updated_at - timestamptz : When the shelter information was last updated.

13 - sos_alerts [Represents a citizen emergency request.]
    id - primary key - uuid : Unique ID for the SOS alert.
    lat - float 8
    lng - float 8
    status - text : Current SOS state, e.g. active, assigned, resolved, cancelled.
    severity - text : Urgency level of the SOS.
    assigned_volunteer_id - uuid - foreign key -> volunteers.id : Volunteer currently assigned to this SOS.
    source - text : How the SOS was generated, e.g. citizen_app, operator, automated_detection.
    created_at - timestamptz : When the SOS was created.
    rescue_case_id - uuid - foreign key -> rescue_cases.id : Rescue case created from this SOS.
    incident_id - uuid - foreign key -> incidents.id : Incident associated with this SOS.

14 - volunteers [Stores available rescue personnel/volunteers.]
    id - primary key - uuid : Unique volunteer ID.
    name - text : Volunteer name.
    skill - text : Relevant skill, e.g. first_aid, swimming, boat_operator, medical.
    lat - float 8: Volunteer’s current/last known latitude.
    lng - float 8: Volunteer’s current/last known longitude.
    available - boolean: Whether the volunteer is currently available for assignment.
    created_at - timestamptz: When the volunteer was registered.

shelter_occupancy - VIEW  [This isn't an actual table storing independent data. It calculates shelter occupancy from other tables.]
     shelter_id - uuid : ID of the shelter.
     name - text : Shelter name.
     capacity - int4: Maximum shelter capacity, obtained from shelters.
     current_occupancy - int8 : Number of citizens currently checked into that shelter.


# overall data flow from start to end - in proper manner.

                    FLOOD ZONES
                        │
                        ↓
                 ROAD SEGMENTS
                        │
                        ↓
              ┌───── INCIDENT ─────┐
              │         │           │
              ↓         ↓           ↓
          DRONE       SOS       OBSERVATIONS
       DETECTIONS      │           ↑
              │        ↓           │
              └──→ RESCUE CASE ←──┘
                       │
              ┌────────┴────────┐
              ↓                 ↓
          VOLUNTEER          RESOURCE
              │
              ↓
        RESCUE COMPLETED
              │
              ↓
          SHELTER
              │
              ↓
       SHELTER CHECK-IN
              │
              ↓
           CITIZEN


