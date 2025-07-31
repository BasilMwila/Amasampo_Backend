/* eslint-disable linebreak-style */
/* eslint-disable prefer-template */
/* eslint-disable linebreak-style */
/* eslint-disable no-undef */
/* eslint-disable indent */
/* eslint-disable no-labels */
/* eslint-disable no-unused-labels */
/* eslint-disable linebreak-style */
/* eslint-disable no-unused-expressions */
/* eslint-disable linebreak-style */
/* eslint-disable padded-blocks */
/* eslint-disable linebreak-style */
/* eslint-disable eqeqeq */
/* eslint-disable linebreak-style */
/* eslint-disable arrow-parens */
/* eslint-disable linebreak-style */
/* eslint-disable newline-per-chained-call */
/* eslint-disable import/order */
/* eslint-disable linebreak-style */
/* eslint-disable no-plusplus */
/* eslint-disable linebreak-style */
/* eslint-disable radix */
/* eslint-disable linebreak-style */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable linebreak-style */
/* eslint-disable no-unused-vars */
/* eslint-disable linebreak-style */
/* eslint-disable object-curly-newline */
/* eslint-disable camelcase */
/* eslint-disable no-trailing-spaces */
/* eslint-disable import/newline-after-import */
/* eslint-disable linebreak-style */
/* eslint-disable quotes */
/* eslint-disable linebreak-style */
/* eslint-disable no-return-await */
/* eslint-disable linebreak-style */
/* eslint-disable eol-last */
/* eslint-disable operator-linebreak */
/* eslint-disable comma-dangle */
/* eslint-disable arrow-body-style */
/* eslint-disable linebreak-style */
// check-messages-fix.js - Run this to check current status and complete the fix
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { pool } = require('./database');

async function checkAndCompleteFix() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking current messages table status...');
    
    // Check what columns currently exist
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'messages'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Current messages table columns:');
    const columnNames = [];
    columns.rows.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      columnNames.push(col.column_name);
    });
    
    // Check what we need to add
    const needsReceiverId = !columnNames.includes('receiver_id');
    const needsIsRead = !columnNames.includes('is_read');
    const needsProductId = !columnNames.includes('product_id');
    
    console.log('\n📊 Status check:');
    console.log(`  receiver_id column: ${needsReceiverId ? '❌ Missing' : '✅ Present'}`);
    console.log(`  is_read column: ${needsIsRead ? '❌ Missing' : '✅ Present'}`);
    console.log(`  product_id column: ${needsProductId ? '❌ Missing' : '✅ Present'}`);
    
    // Add missing columns one by one (no transaction to avoid rollback issues)
    if (needsReceiverId) {
      console.log('\n🔧 Adding receiver_id column...');
      try {
        await client.query(`
          ALTER TABLE messages 
          ADD COLUMN receiver_id INTEGER REFERENCES users(id)
        `);
        console.log('✅ receiver_id column added');
      } catch (error) {
        console.error('❌ Failed to add receiver_id:', error.message);
      }
    }
    
    if (needsIsRead) {
      console.log('🔧 Adding is_read column...');
      try {
        await client.query(`
          ALTER TABLE messages 
          ADD COLUMN is_read BOOLEAN DEFAULT false
        `);
        console.log('✅ is_read column added');
      } catch (error) {
        console.error('❌ Failed to add is_read:', error.message);
      }
    }
    
    if (needsProductId) {
      console.log('🔧 Adding product_id column...');
      try {
        await client.query(`
          ALTER TABLE messages 
          ADD COLUMN product_id INTEGER REFERENCES products(id)
        `);
        console.log('✅ product_id column added');
      } catch (error) {
        console.error('❌ Failed to add product_id:', error.message);
      }
    }
    
    // Add indexes
    console.log('\n🔧 Adding performance indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id, is_read) WHERE is_read = false'
    ];
    
    for (const indexSql of indexes) {
      try {
        await client.query(indexSql);
        console.log(`✅ Index created: ${indexSql.match(/idx_[a-z_]+/)[0]}`);
      } catch (error) {
        if (error.code === '42P07') {
          console.log(`ℹ️  Index already exists: ${indexSql.match(/idx_[a-z_]+/)[0]}`);
        } else {
          console.error(`❌ Index creation failed: ${error.message}`);
        }
      }
    }
    
    // Final status check
    console.log('\n🎉 Fix completed! Final table structure:');
    const finalColumns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'messages'
      ORDER BY ordinal_position
    `);
    
    finalColumns.rows.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // Check if we can now use both messaging approaches
    const hasReceiverId = finalColumns.rows.some(col => col.column_name === 'receiver_id');
    const hasConversationId = finalColumns.rows.some(col => col.column_name === 'conversation_id');
    
    console.log('\n📞 Messaging system compatibility:');
    console.log(`  Direct messaging (receiver_id): ${hasReceiverId ? '✅ Supported' : '❌ Not supported'}`);
    console.log(`  Conversation-based messaging: ${hasConversationId ? '✅ Supported' : '❌ Not supported'}`);
    
    if (hasReceiverId && hasConversationId) {
      console.log('\n🎊 Perfect! Your database now supports both messaging approaches!');
      console.log('   You can use either the direct messaging API or conversation-based API.');
    } else if (hasConversationId) {
      console.log('\n✅ Your database is set up for conversation-based messaging.');
      console.log('   Use the conversation-based messages.js route I provided.');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

// Run the check
checkAndCompleteFix();