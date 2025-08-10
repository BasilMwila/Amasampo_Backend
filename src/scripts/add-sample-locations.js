// scripts/add-sample-locations.js - Add sample seller locations for testing
require('dotenv').config();
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function addSampleLocations() {
  const client = await pool.connect();
  
  try {
    console.log('🗺️ Adding sample seller locations...');

    // Get existing sellers
    const sellersResult = await client.query(
      'SELECT id, name, shop_name FROM users WHERE user_type = \'seller\' LIMIT 10'
    );

    if (sellersResult.rows.length === 0) {
      console.log('❌ No sellers found. Please create some sellers first.');
      return;
    }

    console.log(`📋 Found ${sellersResult.rows.length} sellers`);

    // Sample locations in Ghana (around Accra and other major cities)
    const locations = [
      {
        address: '123 Oxford Street, Osu',
        city: 'Accra',
        state: 'Greater Accra',
        country: 'Ghana',
        latitude: 5.5557,
        longitude: -0.1963,
        description: 'Electronics and gadgets store in the heart of Osu'
      },
      {
        address: '456 Kwame Nkrumah Avenue',
        city: 'Accra',
        state: 'Greater Accra', 
        country: 'Ghana',
        latitude: 5.5692,
        longitude: -0.1967,
        description: 'Fashion and clothing boutique'
      },
      {
        address: '789 Ring Road Central',
        city: 'Kumasi',
        state: 'Ashanti',
        country: 'Ghana',
        latitude: 6.6885,
        longitude: -1.6244,
        description: 'Traditional crafts and local products'
      },
      {
        address: '321 Liberation Road',
        city: 'Cape Coast',
        state: 'Central',
        country: 'Ghana',
        latitude: 5.1053,
        longitude: -1.2466,
        description: 'Coastal marketplace with fresh seafood and local goods'
      },
      {
        address: '654 Tamale Main Street',
        city: 'Tamale',
        state: 'Northern',
        country: 'Ghana',
        latitude: 9.4034,
        longitude: -0.8424,
        description: 'Northern region specialty foods and crafts'
      }
    ];

    // Add locations to sellers
    for (let i = 0; i < sellersResult.rows.length && i < locations.length; i++) {
      const seller = sellersResult.rows[i];
      const location = locations[i];

      const business_hours = {
        monday: { open: '08:00', close: '18:00', closed: false },
        tuesday: { open: '08:00', close: '18:00', closed: false },
        wednesday: { open: '08:00', close: '18:00', closed: false },
        thursday: { open: '08:00', close: '18:00', closed: false },
        friday: { open: '08:00', close: '18:00', closed: false },
        saturday: { open: '09:00', close: '16:00', closed: false },
        sunday: { open: '10:00', close: '14:00', closed: false }
      };

      await client.query(
        `UPDATE users SET 
           shop_address = $1,
           shop_city = $2,
           shop_state = $3,
           shop_country = $4,
           latitude = $5,
           longitude = $6,
           business_hours = $7,
           shop_description = $8,
           updated_at = NOW()
         WHERE id = $9`,
        [
          location.address,
          location.city,
          location.state,
          location.country,
          location.latitude,
          location.longitude,
          JSON.stringify(business_hours),
          location.description,
          seller.id
        ]
      );

      console.log(`✅ Updated ${seller.name} (${seller.shop_name}) with location in ${location.city}`);
    }

    // Verify the updates
    const updatedSellers = await client.query(
      `SELECT id, name, shop_name, shop_city, latitude, longitude 
       FROM users 
       WHERE user_type = 'seller' AND latitude IS NOT NULL 
       ORDER BY shop_city`
    );

    console.log('\n📍 Sellers with locations:');
    updatedSellers.rows.forEach(seller => {
      console.log(`  • ${seller.name} (${seller.shop_name}) - ${seller.shop_city} [${seller.latitude}, ${seller.longitude}]`);
    });

    console.log(`\n🎉 Successfully added locations to ${updatedSellers.rows.length} sellers!`);
    console.log('\n🗺️ You can now test the map feature - sellers should appear on the map!');
    
  } catch (error) {
    console.error('❌ Error adding sample locations:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
addSampleLocations()
  .then(() => {
    console.log('\n✅ Sample locations added successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to add sample locations:', error);
    process.exit(1);
  });