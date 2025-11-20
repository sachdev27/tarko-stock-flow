-- Sample Data Script for Tarko Inventory System
-- Creates realistic production and sale transactions

-- Get IDs we'll need
DO $$
DECLARE
    admin_user_id UUID;
    hdpe_type_id UUID;
    sprinkler_type_id UUID;
    tarko_gold_id UUID;
    tarko_eco_id UUID;
    customer1_id UUID;
    customer2_id UUID;

    -- HDPE Variants
    hdpe_32mm_pn6_var_id UUID;
    hdpe_40mm_pn6_var_id UUID;
    hdpe_50mm_pn8_var_id UUID;

    -- Sprinkler Variants
    sprinkler_15mm_var_id UUID;
    sprinkler_20mm_var_id UUID;

    -- Batch IDs
    batch1_id UUID;
    batch2_id UUID;
    batch3_id UUID;
    batch4_id UUID;
    batch5_id UUID;

    -- Roll IDs
    roll_id UUID;

BEGIN
    -- Get existing IDs
    SELECT id INTO admin_user_id FROM users WHERE username = 'admin' LIMIT 1;
    SELECT id INTO hdpe_type_id FROM product_types WHERE name = 'HDPE Pipe' LIMIT 1;
    SELECT id INTO sprinkler_type_id FROM product_types WHERE name = 'Sprinkler Pipe' LIMIT 1;
    SELECT id INTO tarko_gold_id FROM brands WHERE name = 'Tarko Gold' LIMIT 1;
    SELECT id INTO tarko_eco_id FROM brands WHERE name = 'Tarko Eco' LIMIT 1;

    -- Create customers if they don't exist
    INSERT INTO customers (name, contact_person, phone, email, address)
    VALUES
        ('ABC Constructions', 'Rajesh Kumar', '9876543210', 'rajesh@abcconstructions.com', 'Mumbai, Maharashtra')
    ON CONFLICT DO NOTHING
    RETURNING id INTO customer1_id;

    IF customer1_id IS NULL THEN
        SELECT id INTO customer1_id FROM customers WHERE name = 'ABC Constructions' LIMIT 1;
    END IF;

    INSERT INTO customers (name, contact_person, phone, email, address)
    VALUES
        ('SSD Sales', 'Suresh Patel', '9988776655', 'suresh@ssdsales.com', 'Delhi, India')
    ON CONFLICT DO NOTHING
    RETURNING id INTO customer2_id;

    IF customer2_id IS NULL THEN
        SELECT id INTO customer2_id FROM customers WHERE name = 'SSD Sales' LIMIT 1;
    END IF;

    -- Create product variants
    -- HDPE 32mm PN6
    INSERT INTO product_variants (product_type_id, brand_id, parameters)
    VALUES (hdpe_type_id, tarko_gold_id, '{"PE": "63", "OD": "32mm", "PN": "6"}'::jsonb)
    RETURNING id INTO hdpe_32mm_pn6_var_id;

    -- HDPE 40mm PN6
    INSERT INTO product_variants (product_type_id, brand_id, parameters)
    VALUES (hdpe_type_id, tarko_eco_id, '{"PE": "63", "OD": "40mm", "PN": "6"}'::jsonb)
    RETURNING id INTO hdpe_40mm_pn6_var_id;

    -- HDPE 50mm PN8
    INSERT INTO product_variants (product_type_id, brand_id, parameters)
    VALUES (hdpe_type_id, tarko_gold_id, '{"PE": "80", "OD": "50mm", "PN": "8"}'::jsonb)
    RETURNING id INTO hdpe_50mm_pn8_var_id;

    -- Sprinkler 15mm Type A
    INSERT INTO product_variants (product_type_id, brand_id, parameters)
    VALUES (sprinkler_type_id, tarko_gold_id, '{"OD": "15mm", "Type": "A", "color": "Blue"}'::jsonb)
    RETURNING id INTO sprinkler_15mm_var_id;

    -- Sprinkler 20mm Type B
    INSERT INTO product_variants (product_type_id, brand_id, parameters)
    VALUES (sprinkler_type_id, tarko_eco_id, '{"OD": "20mm", "Type": "B", "color": "Green"}'::jsonb)
    RETURNING id INTO sprinkler_20mm_var_id;

    -- Batch 1: HDPE 32mm PN6 - 3 rolls of 500m each
    batch1_id := gen_random_uuid();
    INSERT INTO batches (
        id, product_variant_id, batch_code, batch_no,
        initial_quantity, current_quantity, weight_per_meter, total_weight,
        production_date, created_at
    ) VALUES (
        batch1_id, hdpe_32mm_pn6_var_id, 'HDPE-32-001', '001',
        1500, 1500, 2.256, 3384000,
        NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'
    );

    -- Create 3 rolls for Batch 1
    FOR i IN 1..3 LOOP
        INSERT INTO rolls (batch_id, product_variant_id, length_meters, initial_length_meters, status, roll_type)
        VALUES (batch1_id, hdpe_32mm_pn6_var_id, 500, 500, 'AVAILABLE', 'standard');
    END LOOP;

    -- Transaction for Batch 1
    INSERT INTO transactions (
        batch_id, transaction_type, quantity_change,
        notes, created_by, created_at
    ) VALUES (
        batch1_id, 'PRODUCTION', 1500,
        'Initial production batch', admin_user_id, NOW() - INTERVAL '10 days'
    );

    -- Batch 2: HDPE 40mm PN6 - 2 rolls of 500m each
    batch2_id := gen_random_uuid();
    INSERT INTO batches (
        id, product_variant_id, batch_code, batch_no,
        initial_quantity, current_quantity, weight_per_meter, total_weight,
        created_at
    ) VALUES (
        batch2_id, hdpe_40mm_pn6_var_id, 'HDPE-40-001', '001',
        1000, 1000, 2.882, 2882000, NOW() - INTERVAL '8 days',
        NOW() - INTERVAL '8 days'
    );

    -- Create 2 rolls for Batch 2
    FOR i IN 1..2 LOOP
        INSERT INTO rolls (batch_id, product_variant_id, length_meters, initial_length_meters, status, roll_type)
        VALUES (batch2_id, hdpe_40mm_pn6_var_id, 500, 500, 'AVAILABLE', 'standard');
    END LOOP;

    INSERT INTO transactions (
        batch_id, transaction_type, quantity_change,
        notes, created_by, created_at
    ) VALUES (
        batch2_id, 'PRODUCTION', 1000,
        'Standard production run', admin_user_id, NOW() - INTERVAL '8 days'
    );

    -- Batch 3: HDPE 50mm PN8 - 4 rolls of 400m each
    batch3_id := gen_random_uuid();
    INSERT INTO batches (
        id, product_variant_id, batch_code, batch_no,
        initial_quantity, current_quantity, weight_per_meter, total_weight,
        created_at
    ) VALUES (
        batch3_id, hdpe_50mm_pn8_var_id, 'HDPE-50-001', '001',
        1600, 1600, 4.507, 7211200, NOW() - INTERVAL '5 days',
        NOW() - INTERVAL '5 days'
    );

    -- Create 4 rolls for Batch 3
    FOR i IN 1..4 LOOP
        INSERT INTO rolls (batch_id, product_variant_id, length_meters, initial_length_meters, status, roll_type)
        VALUES (batch3_id, hdpe_50mm_pn8_var_id, 400, 400, 'AVAILABLE', 'standard');
    END LOOP;

    INSERT INTO transactions (
        batch_id, transaction_type, quantity_change,
        notes, created_by, created_at
    ) VALUES (
        batch3_id, 'PRODUCTION', 1600,
        'Large diameter production', admin_user_id, NOW() - INTERVAL '5 days'
    );

    -- Batch 4: Sprinkler 15mm - 500 pieces (10 bundles of 50 each)
    batch4_id := gen_random_uuid();
    INSERT INTO batches (
        id, product_variant_id, batch_code, batch_no,
        initial_quantity, current_quantity, weight_per_meter, total_weight,
        piece_length, created_at
    ) VALUES (
        batch4_id, sprinkler_15mm_var_id, 'SPR-15-001', '001',
        500, 500, 0.150, 3750000, 5.0, NOW() - INTERVAL '6 days',
        NOW() - INTERVAL '6 days'
    );

    -- Create 10 bundles of 50 pieces each
    FOR i IN 1..10 LOOP
        INSERT INTO rolls (
            batch_id, product_variant_id, length_meters, initial_length_meters,
            status, roll_type, bundle_size, is_cut_roll
        ) VALUES (
            batch4_id, sprinkler_15mm_var_id, 50, 50,
            'AVAILABLE', 'bundle_50', 50, FALSE
        );
    END LOOP;

    INSERT INTO transactions (
        batch_id, transaction_type, quantity_change,
        notes, created_by, created_at
    ) VALUES (
        batch4_id, 'PRODUCTION', 500,
        'Sprinkler pipe production - 500 pieces', admin_user_id, NOW() - INTERVAL '6 days'
    );

    -- Batch 5: Sprinkler 20mm - 300 pieces (5 bundles of 50 + 1 spare of 50)
    batch5_id := gen_random_uuid();
    INSERT INTO batches (
        id, product_variant_id, batch_code, batch_no,
        initial_quantity, current_quantity, weight_per_meter, total_weight,
        piece_length, created_at
    ) VALUES (
        batch5_id, sprinkler_20mm_var_id, 'SPR-20-001', '001',
        300, 300, 0.200, 3000000, 6.0, NOW() - INTERVAL '4 days',
        NOW() - INTERVAL '4 days'
    );

    -- Create 5 bundles
    FOR i IN 1..5 LOOP
        INSERT INTO rolls (
            batch_id, product_variant_id, length_meters, initial_length_meters,
            status, roll_type, bundle_size, is_cut_roll
        ) VALUES (
            batch5_id, sprinkler_20mm_var_id, 50, 50,
            'AVAILABLE', 'bundle_50', 50, FALSE
        );
    END LOOP;

    -- Create 1 spare
    INSERT INTO rolls (
        batch_id, product_variant_id, length_meters, initial_length_meters,
        status, roll_type, bundle_size, is_cut_roll
    ) VALUES (
        batch5_id, sprinkler_20mm_var_id, 50, 50,
        'AVAILABLE', 'spare', NULL, FALSE
    );

    INSERT INTO transactions (
        batch_id, transaction_type, quantity_change,
        notes, created_by, created_at
    ) VALUES (
        batch5_id, 'PRODUCTION', 300,
        'Sprinkler pipe batch - 300 pieces', admin_user_id, NOW() - INTERVAL '4 days'
    );

    RAISE NOTICE 'Sample data created successfully!';
    RAISE NOTICE 'Created 5 batches with:';
    RAISE NOTICE '  - 3 HDPE pipe batches (9 rolls total)';
    RAISE NOTICE '  - 2 Sprinkler pipe batches (16 bundles + 1 spare)';
    RAISE NOTICE 'All items are in stock and available for dispatch.';

END $$;
