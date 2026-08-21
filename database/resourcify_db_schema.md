# list of tables used in the database of resourcify
# all row entries are intended for maximum data collection
# we can fill the relevant columns and let other remain null - they wont affect the functionality of our website

1 - citizens<br>
    id - uuid - primary key : Unique ID for each citizen. Used to identify the citizen across SOS alerts, rescue cases, observations, etc. <br>
    name - text : Citizen's name. <br>
    phone - text : Citizen's contact number for communication during rescue.<br>
    last_known_lat - float 8 : Latitude of the citizen's most recently known location.<br>
    last_known_lng - float 8 : Longitude of the citizen's most recently known location.<br>
    created_at - timestamptz : When the citizen record was first created.<br>
    updated_at - timestamptz : When the citizen's information/location was last updated.<br>

2 - drone_detections [Stores individual things detected by the drone.]<br>
    id - primary key - uuid : Unique ID for this drone detection.<br>
    lat - float 8 : Latitude where the drone detected something.<br>
    lng - float 8 : Longitude where the drone detected something.<br>
    observation_type - text : What the drone detected, e.g. person, submerged_vehicle, blocked_road, flooded_area.<br>
    confidence - float8 : AI/model confidence in the detection, e.g. 0.94.<br>
    created_at - timestamptz : When the detection was recorded.<br>
    mission_id - uuid - foreign key  -> drone_mission.id : Links this detection to the drone mission/video from which it came.<br>
    road_id - uuid - foreign key -> road_segments.id : Links the detection to a particular road if it concerns a road.<br>
    incident_id - uuid - foreign key -> incidents.id : Links the detection to the larger incident generated/updated from it.<br>
    source - text : Source of the detection, e.g. drone_yolov8, manual_drone_review.<br>
    evidence_ref-text : Reference to supporting evidence, such as a video filename, frame ID, image URL/path, etc.<br>

3 - drone_missions [Represents one drone deployment/flight/video mission]<br>
    id - primary key - uuid : Unique ID for the drone mission.<br>
    mission_code -text : Human-readable mission identifier, e.g. DRONE-PUNE-001.<br>
    video_reference -text : Location/reference of the drone video being analyzed.<br>
    area_lat - float 8 : Latitude representing the mission's target/central area.<br>
    area_lng - float 8 : Longitude representing the mission's target/central area.<br>
    created_at - timestamptz : When the mission was recorded/created.<br>

4 - flood_zones [Stores predefined flood-risk geographical areas.]<br>
    id - primary key - uuid : Unique ID for the flood zone.<br>
    geojson_polygon - jsonb : Polygon defining the actual geographical boundary of the flood-risk zone.<br>
    severity - text : Flood severity classification, e.g. low, moderate, high, critical.<br>
    created_at - timestamptz : When this flood-zone record was created.<br>
    ward_name - text : Name of the Pune ward/area covered by the zone.<br>
    risk_score - numeric : Numerical flood-risk score calculated from factors such as historical flooding, rainfall, elevation, drainage, etc.<br>
    updated_at - timestamptz: When the flood-zone information was last updated.<br>


5 - incidents [An incident represents a meaningful disaster event that the system needs to track.]<br>
    id - primary key - uuid : Unique ID for the incident.<br>
    type - text: Type of incident, e.g. flooded_road, person_stranded, vehicle_submerged, infrastructure_damage.<br>
    lat - float 8: Latitude of the incident.<br>
    lng - float 8: Longitude of the incident.<br>
    severity - text: Importance/danger level, e.g. low, medium, high, critical.<br>
    confidence - float8 :Confidence that the incident is genuine/correctly classified.<br>
    status - text :Current state, e.g. detected, verified, responding, resolved.<br>
    created_at - timestamptz: When the incident was first recorded.<br>
    updated_at - timestamptz: When the incident was last updated.<br>

6 -  observations [This is your general evidence/observation table. It lets different sources report information about the same incident.]<br>
    id - primary key - uuid : Unique ID for the observation.<br>	
    source - text : Where the observation came from, e.g. drone, citizen, operator, sensor.<br>
    observation_type - text : What was observed, e.g. flooded_road, stranded_person, water_level_high.<br>
    lat - float 8: Latitude of the observation.<br>
    lng - float 8:Longitude of the observation.<br>
    confidence - float8: Confidence/reliability of the observation.<br>
    evidence_ref-text: Supporting evidence such as photo, video, audio, drone frame, etc.<br>
    incident_id - uuid - foreign key -> incidents.id :Incident that this observation supports/reports.<br>
    citizen_id - uuid - foreign key -> citizens.id :Citizen who submitted the observation, if applicable.<br>
    sos_id - uuid - foreign key -> sos_alerts.id :SOS alert associated with the observation, if applicable.<br>
    road_id - uuid - foreign key ->road_segments.id :Road associated with the observation, if applicable.<br>
    created_at - timestamptz : When the observation was recorded/submitted.<br>
	

7 - rescue_cases [Represents an actual rescue operation/case.]<br>
    id - primary key - uuid : Unique ID for the rescue case.<br>
    citizen_id - uuid - foreign key -> citizens.id : Citizen who needs assistance.<br>
    sos_id - uuid - foreign key -> sos_alerts.id : SOS alert that triggered the rescue case.<br>
    volunteer_id - uuid - foreign key -> volunteers.id : Volunteer assigned to handle the rescue.<br>
    status- text : Current rescue state, e.g. pending, assigned, in_progress, rescued, cancelled.<br>
    created_at - timestamptz : When the rescue case was created.<br>
    updated_at - timestamptz : When its information was last updated.<br>
    incident_id - uuid - foreign key -> incidents.id : Incident associated with this rescue.<br>
    resource_id - uuid - foreign key -> resources.id :Resource being used/assigned for the rescue, e.g. boat, emergency vehicle, medical team.<br>

8 - rescue_status_history [Stores the timeline of a rescue case.]<br>
    id - primary key - uuid : Unique ID for this status-history entry.<br>
    rescue_case_id - uuid - foreign key -> rescue_cases.id : Rescue case whose status changed.<br>
    status - text : Status at this point in time.<br>
    notes - text : Additional information about the status change.<br>
    created_at - timestamptz : When this status update happened.<br>
    
9 - resources [Represents physical/emergency resources available for disaster response.]<br>
    id - primary key - uuid : Unique resource ID.<br>
    type - text : Resource type, e.g. boat, ambulance, rescue_vehicle, medical_team.<br>
    lat - float 8 :<br>
    lng - float 8 :<br>
    available - boolean : Whether the resource is currently available for assignment.<br>
    capacity - int4 : Number of people the resource can accommodate/handle.<br>
    created_at - timestamptz : When the resource was registered.<br>

10 - road_segments [Represents individual roads/road sections monitored by your system.]<br>
    id - primary key - uuid : Unique ID for the road segment.<br>
    name - text : Road/street name.<br>
    start_lat - float 8 :<br>
    start_lng - float 8 :<br>
    end_lat - float 8 :<br>
    end_lng - float 8 :<br>
    status - text : Current road condition, e.g. open, flooded, blocked, unsafe.<br>
    confidence - float8 :Confidence in the current road-status information.<br>
    last_observed_at timestamptz : When the road was most recently observed/updated.<br>
    created_at - timestamptz : When the road segment was added to the database.<br>

11 - shelter_checkins   [Tracks which citizens reached which shelters.]<br>
    id - primary key - uuid : Unique check-in record ID.<br>
    citizen_id - uuid - foreign key  -> citizens.id : Citizen who checked in.<br>
    shelter_id - uuid - foreign key -> shelters.id : Shelter where the citizen checked in.<br>
    check_in_time - timestamptz :Time the citizen arrived.<br>
    check_out_time - timestamptz : Time the citizen left. Can remain NULL while still there.<br>
    rescue_case_id - uuid - foreign key -> rescue_cases.id : Rescue case that brought the citizen to the shelter, if applicable.<br>

12 - shelters [Stores emergency shelter information.]<br>
    id - primary key - uuid : Unique shelter ID.<br>
    name - text<br>
    lat - float 8<br>
    lng - float 8<br>
    capacity - int4 : Maximum number of people the shelter can accommodate.<br>
    contact - text: Contact number/details for the shelter.<br>
    status - text: Current state, e.g. open, closed, full, emergency_only.<br>
    updated_at - timestamptz : When the shelter information was last updated.<br>

13 - sos_alerts [Represents a citizen emergency request.]<br>
    id - primary key - uuid : Unique ID for the SOS alert.<br>
    lat - float 8<br>
    lng - float 8<br>
    status - text : Current SOS state, e.g. active, assigned, resolved, cancelled.<br>
    severity - text : Urgency level of the SOS.<br>
    assigned_volunteer_id - uuid - foreign key -> volunteers.id : Volunteer currently assigned to this SOS.<br>
    source - text : How the SOS was generated, e.g. citizen_app, operator, automated_detection.<br>
    created_at - timestamptz : When the SOS was created.<br>
    rescue_case_id - uuid - foreign key -> rescue_cases.id : Rescue case created from this SOS.<br>
    incident_id - uuid - foreign key -> incidents.id : Incident associated with this SOS.<br>

14 - volunteers [Stores available rescue personnel/volunteers.]<br>
    id - primary key - uuid : Unique volunteer ID.<br>
    name - text : Volunteer name.<br>
    skill - text : Relevant skill, e.g. first_aid, swimming, boat_operator, medical.<br>
    lat - float 8: Volunteer’s current/last known latitude.<br>
    lng - float 8: Volunteer’s current/last known longitude.<br>
    available - boolean: Whether the volunteer is currently available for assignment.<br>
    created_at - timestamptz: When the volunteer was registered.<br>

shelter_occupancy - VIEW  [This isn't an actual table storing independent data. It calculates shelter occupancy from other tables.]<br>
     shelter_id - uuid : ID of the shelter.<br>
     name - text : Shelter name.<br>
     capacity - int4: Maximum shelter capacity, obtained from shelters.<br>
     current_occupancy - int8 : Number of citizens currently checked into that shelter.<br>
<br>

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


