# Export & Database Management Guide

## Overview
This guide covers the new database management and export features added to the Tarko Inventory System.

## Features

### 1. Database Clearing Script
Location: `backend/clear_inventory.py`

A safe utility to clear all inventory and transaction data while preserving master data (product types, brands, customers, users).

#### What it does:
- Deletes all transactions
- Deletes all rolls
- Deletes all batches
- Resets the batch_no sequence to 1
- **Preserves:** Product types, brands, customers, users, and other configuration data

#### How to use:
```bash
cd backend
python clear_inventory.py
```

The script will ask for confirmation before proceeding. Type `yes` to confirm.

**⚠️ Warning:** This action is irreversible. Make sure you have backups if needed.

---

### 2. Sample Import CSV Files
Location: `backend/sample_hdpe_import.csv` and `backend/sample_sprinkler_import.csv`

Two pre-configured CSV files with sample data for testing or initial setup.

#### HDPE Sample (10 batches, 6,150 meters total)
- **File:** `sample_hdpe_import.csv`
- **Variations:** PE 100/80/63, PN 10/16, OD 25-63mm
- **Columns:** Batch Code, Batch No, Product Type, Brand, Production Date, Initial Quantity, Weight per Meter, Total Weight, Attachment URL, PE, OD, PN

#### Sprinkler Sample (10 batches, 176 bundles + 24 spares)
- **File:** `sample_sprinkler_import.csv`
- **Variations:** Bundle sizes (5, 10, 15, 20 pieces), Types (L, C)
- **Columns:** Batch Code, Batch No, Product Type, Brand, Production Date, Bundle Count, Bundle Size, Spare Count, OD, PN, Type

#### How to import:
1. Go to **Inventory** page
2. Click **Import** button
3. Select the appropriate CSV file
4. Confirm import

---

### 3. Dedicated Export Pages

#### Overview
Separate, dedicated pages for exporting HDPE and Sprinkler inventory data with product-specific columns and formatting.

#### Access Methods:
1. **From Inventory Page:**
   - Click the **Export** dropdown button
   - Select "Export HDPE Inventory" or "Export Sprinkler Inventory"

2. **Direct URLs:**
   - HDPE: `/export/hdpe`
   - Sprinkler: `/export/sprinkler`

#### HDPE Export Page
**Route:** `/export/hdpe`

**Features:**
- Summary cards: Total Rolls, Total Length (m), Total Weight (ton)
- Interactive data table
- Groups rolls by:
  - Standard Rolls (by original length)
  - Cut Rolls (by current length)
- Download button exports to CSV

**CSV Columns:**
- Batch Code, Batch No
- Product Type, Brand, Production Date
- PE, OD (mm), PN (bar)
- Item Type (Standard Roll / Cut Roll)
- Original Length (m), Current Length (m)
- Roll Count, Total Meters
- Weight per Meter (kg), Total Weight (kg)

**Use Cases:**
- Meter-based inventory tracking
- Weight calculations
- Roll length analysis
- Standard vs cut roll reporting

#### Sprinkler Export Page
**Route:** `/export/sprinkler`

**Features:**
- Summary cards: Total Bundles, Total Spare Pieces, Total Pieces
- Interactive data table
- Groups by bundle size (5, 10, 15, 20 pieces)
- Includes spare piece counts
- Download button exports to CSV

**CSV Columns:**
- Batch Code, Batch No
- Product Type, Brand, Production Date
- OD (mm), PN (bar), Type
- Item Type (Bundle size or Spare)
- Bundle Size, Bundle Count, Spare Count
- Total Pieces

**Use Cases:**
- Piece-based inventory tracking
- Bundle size distribution
- Spare pieces management
- Type-specific reporting (Lateral vs Circular)

---

### 4. Quick Export (Mixed)
The original export functionality is still available as **"Quick Export (Mixed)"** in the Export dropdown.

**When to use:**
- Need a quick overview of all inventory
- Don't need product-specific formatting
- Exporting small amounts of mixed data

**When NOT to use:**
- Large exports (use dedicated pages)
- Need consistent column structure
- Creating reports for specific product types

---

## Recommended Workflow

### Fresh Database Setup:
1. Clear the database:
   ```bash
   cd backend
   python clear_inventory.py
   # Type "yes" to confirm
   ```

2. Import sample data:
   - Go to Inventory page
   - Import `sample_hdpe_import.csv`
   - Import `sample_sprinkler_import.csv`

3. Verify data:
   - Check inventory page
   - View individual batches
   - Test dispatch functionality

### Regular Export Workflow:
1. Choose the appropriate export method:
   - **HDPE products** → Use `/export/hdpe` page
   - **Sprinkler products** → Use `/export/sprinkler` page
   - **Quick overview** → Use Quick Export dropdown

2. Review data in the table view

3. Click "Export to CSV" to download

4. Open in Excel/Sheets for further analysis

---

## Benefits

### Separation by Product Type:
- **Consistent columns** for each product type
- **No mixed data** in single export
- **Clearer reports** for stakeholders

### HDPE-Specific:
- Meter-based calculations
- Weight tracking
- Standard vs cut roll differentiation
- Original vs current length tracking

### Sprinkler-Specific:
- Piece-based calculations
- Bundle size tracking
- Spare piece management
- Type differentiation (Lateral/Circular)

### Better Performance:
- Filtered data loads faster
- Smaller file sizes
- More responsive tables
- Easier to process in Excel

---

## File Naming Convention

Export files are automatically named with timestamps:
- `hdpe_inventory_YYYY-MM-DD.csv`
- `sprinkler_inventory_YYYY-MM-DD.csv`

Example: `hdpe_inventory_2024-12-19.csv`

---

## Troubleshooting

### Export shows no data:
- Check if you're on the correct export page (HDPE vs Sprinkler)
- Verify inventory exists in the Inventory page
- Try reloading the page

### Import fails:
- Verify CSV format matches template
- Check all required columns are present
- Ensure product types and brands exist in system

### Clear script doesn't work:
- Verify Python and psycopg2 are installed
- Check database connection settings in `config.py`
- Ensure you have proper database permissions

---

## Technical Details

### Export Implementation:
- **Frontend:** React components with TypeScript
- **API:** Uses existing `getBatches()` endpoint
- **Filtering:** Client-side filtering by product type
- **Grouping:** Smart grouping by bundle size, roll length, etc.

### Data Transformation:
- Groups rolls by relevant attributes
- Calculates totals (meters, pieces, weight)
- Formats data for CSV export
- Handles both standard and cut rolls/bundles

### Routes:
- `/export/hdpe` → ExportHDPE.tsx
- `/export/sprinkler` → ExportSprinkler.tsx
- Protected routes (requires authentication)

---

## Future Enhancements

Potential improvements for future versions:
- [ ] Date range filtering
- [ ] Batch selection for export
- [ ] PDF export option
- [ ] Email export functionality
- [ ] Scheduled exports
- [ ] Export templates
- [ ] Custom column selection
- [ ] Multi-format export (Excel, JSON)

---

## Support

For issues or questions:
1. Check this guide first
2. Review console logs for errors
3. Contact system administrator
4. Check backend logs in `backend/` folder

---

**Last Updated:** December 2024
**Version:** 1.0.0
