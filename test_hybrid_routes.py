import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError

import server


class HybridRouteTests(unittest.TestCase):
    def test_hung_hom_northbound_uses_recorded_direction_anchors(self):
        waypoints, label = server.resolve_via_route(
            {"viaRoad": "Hung Hom Tunnel"},
            {"latitude": 22.28, "longitude": 114.18},
            {"latitude": 22.34, "longitude": 114.19},
        )

        self.assertEqual(label, "Hung Hom Tunnel northbound")
        self.assertEqual(len(waypoints), 2)
        self.assertLess(waypoints[0]["latitude"], waypoints[1]["latitude"])

    def test_hung_hom_southbound_uses_recorded_direction_anchors(self):
        waypoints, label = server.resolve_via_route(
            {"viaRoad": "Hung Hom Tunnel"},
            {"latitude": 22.34, "longitude": 114.19},
            {"latitude": 22.28, "longitude": 114.17},
        )

        self.assertEqual(label, "Hung Hom Tunnel southbound")
        self.assertEqual(len(waypoints), 2)
        self.assertGreater(waypoints[0]["latitude"], waypoints[1]["latitude"])

    def test_hung_hom_southbound_builds_with_recorded_corridor(self):
        recorded_geometry = [
            [22.3296852, 114.1554362],
            [22.3037851, 114.1809201],
            [22.2822176, 114.1816588],
            [22.2799883, 114.1779067],
        ]

        def fake_road_route(start, destination, via_points=None):
            return {
                "geometry": [
                    [start["latitude"], start["longitude"]],
                    [destination["latitude"], destination["longitude"]],
                ],
                "duration": 60,
            }

        with mock.patch.object(server, "fetch_routes", return_value=[{
            "id": server.HUNG_HOM_SOUTHBOUND_RECORDING_ID,
            "name": "Recorded Hung Hom southbound",
            "routeType": "recorded",
            "routeGeometry": recorded_geometry,
        }]), mock.patch.object(server, "fetch_road_route", side_effect=fake_road_route):
            route = server.build_hung_hom_recorded_corridor_route(
                {"latitude": 22.34, "longitude": 114.19},
                {"latitude": 22.276, "longitude": 114.17, "label": "Hong Kong"},
                "Kowloon",
                "Hung Hom Tunnel southbound",
                server.HUNG_HOM_SOUTHBOUND_RECORDING_ID,
                server.HUNG_HOM_SOUTHBOUND_RECORDING_NAME,
                server.HUNG_HOM_SOUTHBOUND_RECORDED_CORRIDOR,
            )

        recorded_sections = [section for section in route["routeSections"] if section["source"] == "recorded"]
        self.assertEqual(route["viaLabel"], "Hung Hom Tunnel southbound")
        self.assertEqual(recorded_sections[0]["recordingId"], server.HUNG_HOM_SOUTHBOUND_RECORDING_ID)
        self.assertEqual(recorded_sections[0]["geometry"], recorded_geometry)
        self.assertGreater(route["hybridCoverage"], 0)

    def test_hung_hom_suggestion_uses_calibrated_hybrid_corridor(self):
        def fake_road_route(start, destination, via_points=None):
            return {
                "geometry": [
                    [start["latitude"], start["longitude"]],
                    [destination["latitude"], destination["longitude"]],
                ],
                "distance": server.haversine_distance(
                    start["latitude"], start["longitude"], destination["latitude"], destination["longitude"]
                ),
                "duration": 60,
                "cues": [],
            }

        with mock.patch.object(server, "resolve_route_endpoints", return_value=(
            {"latitude": 22.34, "longitude": 114.19, "label": "Kowloon"},
            {"latitude": 22.28, "longitude": 114.17, "label": "Hong Kong"},
            "Kowloon",
        )), mock.patch.object(server, "fetch_routes", return_value=[]), \
            mock.patch.object(server, "fetch_road_route", side_effect=fake_road_route), \
            mock.patch.object(server, "match_saved_photo_cues", side_effect=lambda cues, geometry=None: cues):
            result = server.prepare_route_options({"destination": "Hong Kong"})

        hung_hom = next(option for option in result["options"] if option["optionId"] == "hung-hom")
        self.assertEqual(hung_hom["routeType"], "hybrid")
        self.assertEqual(hung_hom["viaLabel"], "Hung Hom Tunnel southbound")
        self.assertTrue(any(section["source"] == "recorded" for section in hung_hom["routeSections"]))

    def test_common_tunnel_button_labels_resolve_to_known_waypoints(self):
        western_points, western_label = server.resolve_via_route(
            {"viaRoad": "Western Harbour Tunnel"},
            {"latitude": 22.34, "longitude": 114.19},
            {"latitude": 22.28, "longitude": 114.17},
        )
        eastern_points, eastern_label = server.resolve_via_route(
            {"viaRoad": "Eastern Harbour Crossing"},
            {"latitude": 22.34, "longitude": 114.19},
            {"latitude": 22.28, "longitude": 114.17},
        )

        self.assertEqual(western_label, "Western Tunnel")
        self.assertEqual(eastern_label, "Eastern Tunnel")
        self.assertEqual(western_points[0]["longitude"], 114.1548)
        self.assertEqual(eastern_points[0]["longitude"], 114.2312)

    def test_failed_tunnel_route_can_be_rescued_by_recorded_route(self):
        generated_geometry = [[22.36, 114.0 + index * 0.0002] for index in range(101)]
        recorded_geometry = [[22.36008, 114.004 + index * 0.0002] for index in range(61)]

        def fake_road_route(start, destination, via_points=None):
            if via_points:
                raise ValueError("TaxiBo rejected the generated tunnel route: Route appears to loop back.")
            return {
                "geometry": generated_geometry,
                "distance": server.sum_geometry_distance(generated_geometry),
                "duration": 600,
                "cues": [],
            }

        with mock.patch.object(server, "fetch_routes", return_value=[{
            "id": "recorded-rescue-test",
            "name": "Recorded drive 20/08/2026 上午02:07 to 上午04:14",
            "routeType": "recorded",
            "routeGeometry": recorded_geometry,
        }]), mock.patch.object(server, "fetch_road_route", side_effect=fake_road_route):
            rescue = server.build_recorded_rescue_route(
                {"latitude": 22.36, "longitude": 114.0},
                {"latitude": 22.36, "longitude": 114.02, "label": "Destination"},
                "Start",
                "Western Tunnel",
                ValueError("Route appears to loop back."),
            )

        self.assertIsNotNone(rescue)
        self.assertEqual(rescue["routeType"], "hybrid")
        self.assertEqual(rescue["hdeRescueFromVia"], "Western Tunnel")
        self.assertTrue(any(warning["code"] == "requested-via-rescued-by-recording" for warning in rescue["routeWarnings"]))

    def test_suggested_western_tunnel_rejects_forked_generated_option(self):
        def fake_road_route(start, destination, via_points=None):
            if via_points and via_points[0]["longitude"] == 114.1548:
                return {
                    "geometry": [
                        [22.3000, 114.0000],
                        [22.3000, 114.0020],
                        [22.3000, 114.0040],
                        [22.3000, 114.0060],
                        [22.3000, 114.0080],
                        [22.3000, 114.0100],
                        [22.3001, 114.0040],
                        [22.3001, 114.0060],
                        [22.3001, 114.0080],
                        [22.3001, 114.0100],
                    ],
                    "distance": 2000,
                    "duration": 200,
                    "cues": [],
                }
            return {
                "geometry": [[22.34, 114.19], [22.28, 114.17]],
                "distance": 7000,
                "duration": 900,
                "cues": [],
            }

        with mock.patch.object(server, "resolve_route_endpoints", return_value=(
            {"latitude": 22.34, "longitude": 114.19, "label": "Kowloon"},
            {"latitude": 22.28, "longitude": 114.17, "label": "Hong Kong"},
            "Kowloon",
        )), mock.patch.object(server, "fetch_routes", return_value=[]), \
            mock.patch.object(server, "fetch_road_route", side_effect=fake_road_route), \
            mock.patch.object(server, "match_saved_photo_cues", side_effect=lambda cues, geometry=None: cues):
            result = server.prepare_route_options({"destination": "Hong Kong"})

        western_options = [option for option in result["options"] if option["optionId"] == "western"]
        self.assertFalse(western_options)

    def test_fetch_json_converts_http_error_to_route_message(self):
        error = HTTPError(
            "https://router.example.test",
            400,
            "Bad Request",
            {},
            None,
        )

        with mock.patch.object(server, "urlopen", side_effect=error):
            with self.assertRaisesRegex(ValueError, "Routing service rejected these road points"):
                server.fetch_json("https://router.example.test")

    def test_unsafe_tunnel_route_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "rejected"):
            server.reject_unsafe_tunnel_route(
                {"routeWarnings": [{"code": "route-loop", "title": "Route appears to loop back"}]},
                "Hung Hom Tunnel northbound",
            )

    def test_engine_classifies_hybrid_and_blocked_routes(self):
        hybrid = server.apply_hybrid_engine_assessment({
            "routeType": "hybrid",
            "hybridCoverage": 0.6,
            "routeSections": [
                {"source": "generated"},
                {"source": "recorded"},
                {"source": "generated"},
            ],
            "routeWarnings": [],
        })
        blocked = server.apply_hybrid_engine_assessment({
            "routeWarnings": [{"severity": "high", "title": "Route loop"}],
        })

        self.assertEqual(hybrid["hybridEngine"]["state"], "hybrid")
        self.assertEqual(hybrid["hybridEngine"]["provenCorridorCount"], 1)
        self.assertFalse(hybrid["hybridEngine"]["recordingNeeded"])
        self.assertEqual(blocked["hybridEngine"]["state"], "blocked")
        self.assertTrue(blocked["hybridEngine"]["recordingNeeded"])

    def test_recorded_routes_refresh_into_proven_corridor_library(self):
        original_path = server.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as directory:
                server.DB_PATH = Path(directory) / "corridors.db"
                server.initialize_db("local")
                server.replace_routes([{
                    "id": "recorded-corridor-1",
                    "name": "Recorded drive northbound",
                    "variant": "Recorded",
                    "start": "A",
                    "destination": "B",
                    "routeType": "recorded",
                    "routeGeometry": [[22.28, 114.18], [22.30, 114.18]],
                    "photos": [],
                }])

                status = server.fetch_hybrid_engine_status(refresh=True)

                self.assertEqual(status["corridorCount"], 1)
                self.assertEqual(status["directions"]["northbound"], 1)
                self.assertEqual(status["corridors"][0]["confidence"], 1.0)
        finally:
            server.DB_PATH = original_path

    def test_hde_issue_log_deduplicates_and_tracks_status(self):
        original_path = server.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as directory:
                server.DB_PATH = Path(directory) / "issues.db"
                server.initialize_db("local")
                payload = {
                    "title": "Wrong tunnel approach",
                    "issueType": "recording-needed",
                    "severity": "high",
                    "start": "A",
                    "destination": "B",
                    "via": "Hung Hom Tunnel southbound",
                    "message": "Router used the station loop.",
                    "recordingNeeded": True,
                }

                first = server.log_hybrid_engine_issue(payload=payload)
                second = server.log_hybrid_engine_issue(payload=payload)
                issues = server.fetch_hybrid_engine_issues()

                self.assertEqual(first["id"], second["id"])
                self.assertEqual(len(issues), 1)
                self.assertEqual(issues[0]["occurrenceCount"], 2)
                resolved = server.update_hybrid_engine_issue_status({"id": first["id"], "status": "resolved"})
                self.assertEqual(resolved["status"], "resolved")
        finally:
            server.DB_PATH = original_path

    def test_builds_hybrid_from_continuous_recorded_overlap(self):
        generated_geometry = [[22.3, 114 + index * 0.0002] for index in range(101)]
        recorded_geometry = [[22.30008, 114.004 + index * 0.0002] for index in range(61)]
        generated = {
            "geometry": generated_geometry,
            "distance": server.sum_geometry_distance(generated_geometry),
            "duration": 600,
            "cues": [],
            "start": {"latitude": 22.3, "longitude": 114.0},
            "destination": {"latitude": 22.3, "longitude": 114.02},
        }
        recorded = {
            "id": "recorded-1",
            "name": "Recorded drive test",
            "routeType": "recorded",
            "routeGeometry": recorded_geometry,
        }

        hybrid = server.build_hybrid_route_candidate(generated, recorded)

        self.assertIsNotNone(hybrid)
        self.assertEqual(hybrid["routeType"], "hybrid")
        self.assertGreater(hybrid["hybridCoverage"], 0.5)
        self.assertEqual(
            [section["source"] for section in hybrid["routeSections"]].count("recorded"),
            1,
        )

    def test_does_not_promote_low_confidence_or_long_hybrid_routes(self):
        self.assertFalse(server.should_promote_hybrid_route(None))
        self.assertFalse(server.should_promote_hybrid_route({
            "hybridCoverage": 0.8,
            "recordedSegmentDistance": 3000,
            "distance": 5000,
            "originalGeneratedDistance": 4000,
            "routeWarnings": [{"severity": "high", "title": "Loop"}],
        }))
        self.assertFalse(server.should_promote_hybrid_route({
            "hybridCoverage": 0.2,
            "recordedSegmentDistance": 3000,
            "distance": 5000,
            "originalGeneratedDistance": 4000,
            "routeWarnings": [],
        }))
        self.assertFalse(server.should_promote_hybrid_route({
            "hybridCoverage": 0.7,
            "recordedSegmentDistance": 3000,
            "distance": 6500,
            "originalGeneratedDistance": 4000,
            "routeWarnings": [],
        }))
        self.assertTrue(server.should_promote_hybrid_route({
            "hybridCoverage": 0.6,
            "recordedSegmentDistance": 3000,
            "distance": 4500,
            "originalGeneratedDistance": 4000,
            "routeWarnings": [],
        }))

    def test_rejects_hybrid_with_looping_generated_connector(self):
        generated_geometry = [
            [22.300, 114.000],
            [22.300, 114.003],
            [22.303, 114.003],
            [22.303, 114.000],
            [22.300, 114.000],
            [22.300, 114.004],
            [22.300, 114.006],
            [22.300, 114.008],
            [22.300, 114.010],
        ]
        recorded_geometry = [
            [22.30008, 114.004],
            [22.30008, 114.006],
            [22.30008, 114.008],
            [22.30008, 114.010],
        ]
        generated = {
            "geometry": generated_geometry,
            "distance": server.sum_geometry_distance(generated_geometry),
            "duration": 600,
            "cues": [],
            "start": {"latitude": 22.3, "longitude": 114.0},
            "destination": {"latitude": 22.3, "longitude": 114.01},
        }
        recorded = {
            "id": "recorded-loop-test",
            "name": "Recorded drive test",
            "routeType": "recorded",
            "routeGeometry": recorded_geometry,
        }

        hybrid = server.build_hybrid_route_candidate(generated, recorded, match_radius_meters=25)

        self.assertIsNone(hybrid)

    def test_rejects_low_coverage_hybrid_candidate(self):
        generated_geometry = [[22.3, 114 + index * 0.0002] for index in range(101)]
        recorded_geometry = [[22.30008, 114.004 + index * 0.0002] for index in range(16)]
        generated = {
            "geometry": generated_geometry,
            "distance": server.sum_geometry_distance(generated_geometry),
            "duration": 600,
            "cues": [],
            "start": {"latitude": 22.3, "longitude": 114.0},
            "destination": {"latitude": 22.3, "longitude": 114.02},
        }
        recorded = {
            "id": "recorded-low-coverage-test",
            "name": "Recorded drive test",
            "routeType": "recorded",
            "routeGeometry": recorded_geometry,
        }

        hybrid = server.build_hybrid_route_candidate(generated, recorded)

        self.assertIsNone(hybrid)

    def test_detects_small_angle_branch_out_and_branch_in_shapes(self):
        branch_out = [
            [22.3000, 114.0000],
            [22.3000, 114.0020],
            [22.3000, 114.0040],
            [22.3000, 114.0060],
            [22.3000, 114.0080],
            [22.3000, 114.0100],
            [22.3001, 114.0040],
            [22.3001, 114.0060],
            [22.3001, 114.0080],
            [22.3001, 114.0100],
        ]
        branch_in = [
            [22.3000, 114.0000],
            [22.3000, 114.0020],
            [22.3000, 114.0040],
            [22.3000, 114.0060],
            [22.3000, 114.0080],
            [22.3000, 114.0100],
            [22.3001, 114.0000],
            [22.3001, 114.0020],
            [22.3001, 114.0040],
            [22.3001, 114.0060],
        ]
        single_line = [
            [22.3000, 114.0000],
            [22.3000, 114.0020],
            [22.3002, 114.0040],
            [22.3006, 114.0060],
            [22.3010, 114.0080],
            [22.3015, 114.0100],
        ]

        self.assertTrue(server.route_has_small_angle_branch_risk(branch_out))
        self.assertTrue(server.route_has_small_angle_branch_risk(branch_in))
        self.assertFalse(server.route_has_small_angle_branch_risk(single_line))

    def test_route_options_sort_by_lowest_fork_count_first(self):
        clean = {
            "optionId": "clean",
            "routeType": "standard",
            "routeForkCount": 0,
            "routeWarnings": [],
            "distance": 5000,
            "duration": 600,
        }
        forked = {
            "optionId": "forked",
            "routeType": "standard",
            "routeForkCount": 3,
            "routeWarnings": [{"code": "route-fork", "severity": "high", "count": 3}],
            "distance": 4500,
            "duration": 520,
        }

        sorted_options = server.sort_route_options_by_driver_trust([forked, clean])

        self.assertEqual(sorted_options[0]["optionId"], "clean")

    def test_generated_connector_inside_complex_road_zone_is_high_risk(self):
        hung_hom_connector = [
            [22.3060, 114.1760],
            [22.3050, 114.1790],
            [22.3040, 114.1810],
            [22.3030, 114.1830],
        ]
        ordinary_connector = [
            [22.3400, 114.1200],
            [22.3420, 114.1230],
            [22.3440, 114.1260],
        ]

        self.assertTrue(server.hybrid_connector_has_level_ambiguity_risk(hung_hom_connector))
        self.assertFalse(server.hybrid_connector_has_level_ambiguity_risk(ordinary_connector))

    def test_rejects_hybrid_with_generated_connector_inside_complex_road_zone(self):
        generated_geometry = [
            [22.3060, 114.1760],
            [22.3050, 114.1790],
            [22.3040, 114.1810],
            [22.3030, 114.1830],
            [22.3020, 114.1850],
            [22.3010, 114.1870],
            [22.3000, 114.1890],
        ]
        recorded_geometry = [
            [22.30208, 114.1850],
            [22.30108, 114.1870],
            [22.30008, 114.1890],
        ]
        generated = {
            "geometry": generated_geometry,
            "distance": server.sum_geometry_distance(generated_geometry),
            "duration": 600,
            "cues": [],
            "start": {"latitude": 22.3060, "longitude": 114.1760},
            "destination": {"latitude": 22.3000, "longitude": 114.1890},
        }
        recorded = {
            "id": "recorded-complex-zone-test",
            "name": "Recorded drive test",
            "routeType": "recorded",
            "routeGeometry": recorded_geometry,
        }

        hybrid = server.build_hybrid_route_candidate(generated, recorded, match_radius_meters=25)

        self.assertIsNone(hybrid)

    def test_hybrid_metadata_round_trips_through_database(self):
        original_path = server.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as directory:
                server.DB_PATH = Path(directory) / "test.db"
                server.initialize_db("local")
                server.replace_routes([
                    {
                        "id": "hybrid-1",
                        "name": "Hybrid: test",
                        "variant": "Hybrid Route",
                        "start": "A",
                        "destination": "B",
                        "routeType": "hybrid",
                        "routeGeometry": [[22.28, 114.15], [22.29, 114.16]],
                        "routeSections": [{
                            "source": "recorded",
                            "geometry": [[22.28, 114.15], [22.29, 114.16]],
                        }],
                        "photos": [],
                    }
                ])

                saved = server.fetch_routes()
                self.assertEqual(saved[0]["routeType"], "hybrid")
                self.assertEqual(saved[0]["routeSections"][0]["source"], "recorded")
        finally:
            server.DB_PATH = original_path

    def test_clean_recorded_route_geometry_removes_loop_fork(self):
        geometry = [
            [22.3000, 114.1000],
            [22.3000, 114.1010],
            [22.3000, 114.1020],
            [22.3000, 114.1030],
            [22.3012, 114.1035],
            [22.3024, 114.1035],
            [22.3036, 114.1035],
            [22.3024, 114.1030],
            [22.3012, 114.1030],
            [22.3000, 114.1030],
            [22.3000, 114.1040],
            [22.3000, 114.1050],
        ]

        cleaned, report = server.clean_recorded_route_geometry(geometry)

        self.assertLess(len(cleaned), len(geometry))
        self.assertEqual(report["loopTrimCount"], 1)
        self.assertEqual(cleaned[:4], geometry[:4])
        self.assertEqual(cleaned[-2:], geometry[-2:])

    def test_clean_recorded_route_repairs_long_shortcut_with_road_geometry(self):
        geometry = [
            [22.2893869, 114.1436288],
            [22.3043807, 114.1602283],
        ]
        road_geometry = [
            [22.2893869, 114.1436288],
            [22.2930, 114.1486],
            [22.2983, 114.1543],
            [22.3043807, 114.1602283],
        ]

        with mock.patch.object(server, "fetch_road_route", return_value={
            "geometry": road_geometry,
            "distance": server.sum_geometry_distance(road_geometry),
            "duration": 120,
            "cues": [],
        }):
            repaired, repair_count = server.repair_cleaned_route_gaps(geometry)

        self.assertEqual(repair_count, 1)
        self.assertEqual(repaired, road_geometry)

    def test_clean_recorded_route_uses_western_tunnel_spine_when_router_fails(self):
        geometry = [
            [22.2893869, 114.1436288],
            [22.3043807, 114.1602283],
        ]

        with mock.patch.object(server, "fetch_road_route", side_effect=ValueError("router unavailable")):
            repaired, repair_count = server.repair_cleaned_route_gaps(geometry)

        self.assertEqual(repair_count, 1)
        self.assertGreater(len(repaired), len(geometry))
        self.assertEqual(repaired[0], geometry[0])
        self.assertEqual(repaired[-1], geometry[-1])

    def test_clean_recorded_route_saves_copy_and_keeps_original(self):
        original_path = server.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as directory:
                server.DB_PATH = Path(directory) / "clean-route.db"
                server.initialize_db("local")
                route = {
                    "id": "recorded-route-with-fork",
                    "name": "Recorded drive fork test",
                    "variant": "Recorded from Dashcam road recording",
                    "start": "Start",
                    "destination": "Destination",
                    "routeType": "recorded",
                    "routeGeometry": [
                        [22.3000, 114.1000],
                        [22.3000, 114.1010],
                        [22.3000, 114.1020],
                        [22.3000, 114.1030],
                        [22.3012, 114.1035],
                        [22.3024, 114.1035],
                        [22.3036, 114.1035],
                        [22.3024, 114.1030],
                        [22.3012, 114.1030],
                        [22.3000, 114.1030],
                        [22.3000, 114.1040],
                        [22.3000, 114.1050],
                    ],
                    "photos": [],
                }
                server.replace_routes([route])

                result = server.clean_recorded_route({"routeId": "recorded-route-with-fork"})
                saved = server.fetch_routes()

                self.assertEqual(len(saved), 2)
                self.assertEqual(saved[0]["id"], "recorded-route-with-fork")
                self.assertEqual(len(saved[0]["routeGeometry"]), len(route["routeGeometry"]))
                self.assertEqual(result["route"]["variant"], "Clean route")
                self.assertLess(
                    len(result["route"]["routeGeometry"]),
                    len(route["routeGeometry"]),
                )
                self.assertEqual(result["report"]["loopTrimCount"], 1)
        finally:
            server.DB_PATH = original_path


if __name__ == "__main__":
    unittest.main()
