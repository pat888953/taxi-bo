import tempfile
import unittest
from pathlib import Path

import server


class HybridRouteTests(unittest.TestCase):
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
