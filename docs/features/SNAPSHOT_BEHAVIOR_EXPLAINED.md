# Snapshot Storage Behavior Explanation

## Current Implementation

### 1. Creating Snapshots (Automatic Backend Storage)
**Location**: `/app/snapshots` (Docker) or `./snapshots` (local dev)
**Behavior**: When you create a snapshot:
- Backend automatically saves to its internal storage directory
- No path selection needed - it's in the backend's file system
- Database record created in `database_snapshots` table
- Optionally synced to cloud in background

**Why automatic?**
- Backend knows where to store its own data
- Consistent location across all snapshots
- Easy for backup/restore operations
- No user input needed for basic functionality

### 2. Export to External Storage (Manual Path Required)
**Behavior**: When you export a snapshot:
- You MUST specify a destination path
- Could be USB drive, external hard drive, network share, etc.
- Backend copies snapshot files to that location

**Why manual?**
- External storage devices mount at different paths (e.g., `/Volumes/MyUSB` on Mac)
- User decides where to store the copy (USB, NAS, external drive)
- Cannot predict what external devices are connected
- User may want different locations for different purposes

### 3. Backup Storage Tab (Manual Path Required)
**Behavior**: Browse snapshots from external locations
- You specify which external location to scan
- Backend lists all snapshots found there
- Can import snapshots from that location

**Why manual?**
- External devices may not be permanently connected
- User may have multiple backup locations
- Different users may use different external storage

## Browser Limitations

### Why "Browse" Button Doesn't Work Well

**Security Restrictions**:
- Browsers cannot access file system paths for security reasons
- File System Access API only gives directory **handles**, not full paths
- The `webkitdirectory` input shows confusing "upload files" prompt
- Cannot programmatically read system paths

**This is by design** - browsers intentionally prevent websites from:
- Reading your file system structure
- Getting full file paths
- Accessing directories without user interaction

## Solution: Manual Path Entry

Since browsers can't reliably get directory paths, we use:

1. **Manual text input** (Primary method)
   - User types or pastes the full path
   - Works on all platforms and browsers
   - Clear and explicit

2. **Helper buttons**
   - "Use Documents Folder" - Quick default path
   - Platform-specific path examples shown
   - User can modify the suggested path

3. **Browse button** (Optional, "if supported")
   - May work in some browsers
   - Often shows confusing dialogs
   - Not reliable - kept only as fallback

## Technical Architecture

```
Frontend (Browser)
│
├── Create Snapshot
│   └─→ POST /api/version-control/snapshots
│       └─→ Backend saves to ./snapshots automatically
│
├── Export to External
│   └─→ POST /api/version-control/external/export
│       ├─→ User provides: destination path
│       └─→ Backend copies from ./snapshots to that path
│
└── Import from External
    └─→ POST /api/version-control/external/import
        ├─→ User provides: source path
        └─→ Backend reads from that path and imports
```

## Summary

**Automatic (Backend Storage)**:
- Create snapshot → Backend's `./snapshots` folder
- No path needed - backend manages its own storage

**Manual (External Storage)**:
- Export → User specifies destination
- Import/Browse → User specifies source
- Path needed - user knows their external device locations

**Why this makes sense**:
- Backend controls its own storage (automatic)
- User controls external storage (manual)
- Browser security prevents automatic path detection
- Manual entry is actually more reliable than browse dialogs
