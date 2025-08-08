-- Quick fix for missing seller_id column in order_items table
-- Run this SQL directly in your database

DO $$
BEGIN
    -- Check if seller_id column exists
    IF NOT EXISTS (
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'seller_id'
    ) THEN
        -- Add seller_id column
        ALTER TABLE order_items 
        ADD COLUMN seller_id INTEGER REFERENCES users(id);
        
        RAISE NOTICE 'Added seller_id column to order_items table';
        
        -- Update existing order_items with seller_id from products
        UPDATE order_items 
        SET seller_id = p.seller_id 
        FROM products p 
        WHERE order_items.product_id = p.id 
        AND order_items.seller_id IS NULL;
        
        RAISE NOTICE 'Updated existing order items with seller_id';
        
        -- Create index for better performance
        CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON order_items(seller_id);
        
        RAISE NOTICE 'Created index for seller_id column';
        
    ELSE
        RAISE NOTICE 'seller_id column already exists in order_items table';
    END IF;
END
$$;