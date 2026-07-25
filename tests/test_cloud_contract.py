import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CloudContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = (ROOT / "supabase/migrations/202607250001_initial.sql").read_text()
        cls.client = (ROOT / "web/cloud.js").read_text()

    def test_all_private_tables_enable_rls(self):
        for table in ("profiles", "cases", "artifacts", "collections", "community_posts"):
            self.assertIn(f"alter table public.{table} enable row level security", self.sql)

    def test_storage_is_private_and_scoped_to_user_folder(self):
        self.assertGreaterEqual(self.sql.count("public, file_size_limit"), 2)
        self.assertGreaterEqual(self.sql.count("auth.uid()::text"), 8)
        self.assertIn("'case-media', 'case-media', false", self.sql)
        self.assertIn("'artifact-media', 'artifact-media', false", self.sql)

    def test_service_role_is_not_used_by_browser_adapter(self):
        self.assertNotIn("SERVICE_ROLE", self.client.upper())
        self.assertNotIn("service_role", self.client.lower())

    def test_email_flow_uses_six_digit_otp(self):
        self.assertIn("signInWithOtp", self.client)
        self.assertIn("verifyOtp", self.client)
        self.assertIn("code.length !== 6", self.client)

    def test_local_backup_precedes_cloud_merge(self):
        app = (ROOT / "web/app.js").read_text()
        backup = app.index("museum_collections_web_backup_")
        overwrite = app.index("localStorage.setItem('museum_collections_web', JSON.stringify(merged))")
        self.assertLess(backup, overwrite)


if __name__ == "__main__":
    unittest.main()
