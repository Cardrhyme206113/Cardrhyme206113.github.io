var overviewerConfig = {
    "CONST": {
        "tileSize": 384,
        "image": {
            "defaultMarker": "signpost.png",
            "signMarker": "signpost_icon.png",
            "bedMarker": "bed.png",
            "spawnMarker": "markers/marker_home.png",
            "spawnMarker2x": "markers/marker_home_2x.png",
            "queryMarker": "markers/marker_location.png",
            "queryMarker2x": "markers/marker_location_2x.png",
            "compass": {
                "0": "compass_upper-left.png",
                "1": "compass_upper-right.png",
                "3": "compass_lower-left.png",
                "2": "compass_lower-right.png"
            }
        },
        "mapDivId": "mcmap",
        "UPPERLEFT": 0,
        "UPPERRIGHT": 1,
        "LOWERLEFT": 3,
        "LOWERRIGHT": 2
    },
    "worlds": [
        "VE",
        "CardSMP",
        "Therapy"
    ],
    "map": {
        "debug": false,
        "cacheTag": "1696163530",
        "north_direction": "lower-left",
        "controls": {
            "pan": true,
            "zoom": true,
            "spawn": true,
            "compass": true,
            "mapType": true,
            "overlays": true,
            "coordsBox": true
        }
    },
    "tilesets": [
        {
            "name": "Day Render",
            "zoomLevels": 7,
            "defaultZoom": 1,
            "maxZoom": 7,
            "path": "VE_smooth",
            "base": "",
            "bgcolor": "#1a1a1a",
            "world": "VE",
            "last_rendertime": 1696145769,
            "imgextension": "jpg",
            "isOverlay": false,
            "poititle": "Markers",
            "showlocationmarker": true,
            "center": [
                -298,
                65,
                0
            ],
            "lastrenderversion": 2,
            "minZoom": 0,
            "spawn": [
                -298,
                65,
                0
            ],
            "north_direction": 0
        },
        {
            "name": "Day Render",
            "zoomLevels": 8,
            "defaultZoom": 2,
            "maxZoom": 8,
            "path": "CardSMP_smooth",
            "base": "",
            "bgcolor": "#1a1a1a",
            "world": "CardSMP",
            "last_rendertime": 1707555071,
            "imgextension": "jpg",
            "isOverlay": false,
            "poititle": "Markers",
            "showlocationmarker": true,
            "center": [
                48,
                195,
                0
            ],
            "lastrenderversion": 2,
            "minZoom": 0,
            "spawn": [
                48,
                195,
                0
            ],
            "north_direction": 0
        },
        {
            "name": "Cave Render",
            "zoomLevels": 8,
            "defaultZoom": 2,
            "maxZoom": 8,
            "path": "Therapy_cave",
            "base": "",
            "bgcolor": "#1a1a1a",
            "world": "Therapy",
            "last_rendertime": 1707555071,
            "imgextension": "jpg",
            "isOverlay": false,
            "poititle": "Markers",
            "showlocationmarker": true,
            "center": [
                48,
                195,
                0
            ],
            "lastrenderversion": 2,
            "minZoom": 0,
            "spawn": [
                48,
                195,
                0
            ],
            "north_direction": 0
        }
    ]
};
