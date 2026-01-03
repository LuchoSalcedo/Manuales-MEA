-- =====================================================
-- Update existing manuals with original_filename
-- Run this AFTER running 006_add_original_filename_to_manuals.sql
-- =====================================================

-- Update based on total_pages count (unique identifier for each PDF)

-- Manual 402j05.pdf has 114 pages
UPDATE manuals
SET original_filename = 'Manual 402j05.pdf'
WHERE total_pages = 114 AND original_filename IS NULL;

-- HOBART 90G20P has 274 pages
UPDATE manuals
SET original_filename = 'HOBART 90G20P  SPEC 5359C123  10 - Jul 21, 2016.pdf'
WHERE total_pages = 274 AND original_filename IS NULL;

-- GT1628w353.pdf has 1322 pages
UPDATE manuals
SET original_filename = 'GT1628w353.pdf'
WHERE total_pages = 1322 AND original_filename IS NULL;

-- PM70-02-2TD-25-TOYOTA-PARTS ONLY.pdf has 115 pages
UPDATE manuals
SET original_filename = 'PM70-02-2TD-25-TOYOTA-PARTS ONLY.pdf'
WHERE total_pages = 115 AND original_filename IS NULL;

-- TA35.pdf has 410 pages
UPDATE manuals
SET original_filename = 'TA35.pdf'
WHERE total_pages = 410 AND original_filename IS NULL;

-- TMAC150.pdf has 528 pages
UPDATE manuals
SET original_filename = 'TMAC150.pdf'
WHERE total_pages = 528 AND original_filename IS NULL;

-- manual-chapter4-0002455.pdf has 56 pages
UPDATE manuals
SET original_filename = 'manual-chapter4-0002455.pdf'
WHERE total_pages = 56 AND original_filename IS NULL;

-- Verify updates
SELECT name, total_pages, original_filename
FROM manuals
ORDER BY name;
