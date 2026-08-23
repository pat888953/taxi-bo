import tempfile
import unittest
from pathlib import Path

import server


class LocationCueTests(unittest.TestCase):
    def setUp(self):
        self.original_path = server.DB_PATH
        self.directory = tempfile.TemporaryDirectory()
        server.DB_PATH = Path(self.directory.name) / "test.db"
        server.initialize_db("local")

    def tearDown(self):
        server.DB_PATH = self.original_path
        self.directory.cleanup()

    def create_cue(self, **overrides):
        payload = {
            "title": "Blue tunnel sign",
            "instruction": "Keep right",
            "notes": "Reusable landmark",
            "image": "data:image/png;base64,dGVzdA==",
            "latitude": 22.281167,
            "longitude": 114.157139,
            "activationRadiusMeters": 120,
            "directionMode": "any",
            "confidence": 1,
            **overrides,
        }
        return server.create_location_cue(payload)

    def test_location_cue_crud_without_route(self):
        cue = self.create_cue()

        saved = server.fetch_location_cues()
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["id"], cue["id"])
        self.assertEqual(saved[0]["activationRadiusMeters"], 120)

        deleted = server.delete_location_cue({"id": cue["id"]})
        self.assertEqual(deleted["title"], "Blue tunnel sign")
        self.assertEqual(server.fetch_location_cues(), [])

    def test_location_cue_matches_nearby_generated_cue(self):
        cue = self.create_cue()
        matched = server.match_saved_photo_cues([{
            "id": "generated-1",
            "title": "Generated turn",
            "latitude": 22.2812,
            "longitude": 114.15715,
        }])

        self.assertTrue(matched[0]["matchedPhoto"])
        self.assertEqual(matched[0]["sourceCueType"], "location")
        self.assertEqual(matched[0]["sourceLocationCueId"], cue["id"])

    def test_heading_specific_cue_rejects_opposite_approach(self):
        self.create_cue(directionMode="heading", headingDegrees=90)
        opposite = server.match_saved_photo_cues([{
            "id": "generated-opposite",
            "latitude": 22.281167,
            "longitude": 114.157139,
            "approachHeading": 270,
        }])
        matching = server.match_saved_photo_cues([{
            "id": "generated-matching",
            "latitude": 22.281167,
            "longitude": 114.157139,
            "approachHeading": 100,
        }])

        self.assertFalse(opposite[0]["matchedPhoto"])
        self.assertTrue(matching[0]["matchedPhoto"])

    def test_location_cue_is_added_on_straight_route_without_turn(self):
        cue = self.create_cue()
        geometry = [
            [22.2810, 114.1570],
            [22.281167, 114.157139],
            [22.2814, 114.1573],
        ]

        matched = server.match_saved_photo_cues([], geometry=geometry)

        self.assertEqual(len(matched), 1)
        self.assertEqual(matched[0]["sourceLocationCueId"], cue["id"])
        self.assertEqual(matched[0]["step"], 1)


if __name__ == "__main__":
    unittest.main()
