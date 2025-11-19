# 🚀 Quick Start: Version Control & Backups

## Installation (5 minutes)

```bash
cd backend
./setup_backup_system.sh
```

## What You Get

✅ **Automatic Daily Backups** (2 AM)
✅ **Google Drive Sync** (Optional)
✅ **One-Click Rollback**
✅ **30-Day Retention**

## Daily Use

### Create Backup Before Important Changes
1. Admin Panel → Version Control
2. Click "Create Snapshot"
3. Name it (e.g., "Before Big Import")
4. Done! ✓

### Roll Back if Something Goes Wrong
1. Find the snapshot you want
2. Click "Rollback"
3. Type snapshot name to confirm
4. Database restored! ✓

### Check Drive Sync Status
Look for the badge at the top:
- **🟢 Connected**: Backups syncing to Drive
- **🔴 Disconnected**: Only local backups (still works!)

## Optional: Enable Google Drive

Want backups in the cloud? See `GOOGLE_DRIVE_SETUP.md`

**TLDR:**
1. Google Cloud Console → Create project
2. Enable Drive API
3. Create service account → Download JSON
4. Save as `google_drive_credentials.json`
5. Restart app

## Common Questions

**Q: Do I need Google Drive?**
A: No! Local snapshots work great. Drive is optional for extra safety.

**Q: How often are backups created?**
A: Automatically every day at 2 AM. Plus, you can create manual ones anytime.

**Q: Will rollback delete my current data?**
A: No, it soft-deletes (marks as deleted). Original data preserved.

**Q: How much storage does this use?**
A: ~20 MB per snapshot. 30 snapshots = ~600 MB total.

**Q: What if I mess up a rollback?**
A: Just rollback again to a different snapshot!

## Need Help?

📖 Full guide: `VERSION_CONTROL_GUIDE.md`
☁️ Google Drive setup: `GOOGLE_DRIVE_SETUP.md`
📋 Check logs: `tail -f logs/app.log`

---

**That's it! Your data is now automatically backed up.** 🎉
