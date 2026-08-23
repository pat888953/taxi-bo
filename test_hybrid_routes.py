import tempfile
import unittest
from pathlib import Path

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

    def test_hung_hom_southbound_is_blocked_until_recorded(self):
        with self.assertRaisesRegex(ValueError, "southbound is not calibrated"):
            server.resolve_via_route(
                {"viaRoad": "Hung Hom Tunnel"},
                {"latitude": 22.34, "longitude": 114.19},
                {"latitude": 22.28, "longitude": 114.17},
            )

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


if __name__ == "__main__":
    unittest.main()
