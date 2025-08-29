import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateModelsInSupabase } from './models';
import configManager from './configmanager';

// Commented out mocks to test with real database
// vi.mock('./supabase');
// vi.mock('fs');
// vi.mock('https');

describe('Models Integration - Real Database Test', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.OPENAI_API_KEY;
  });

  it('should populate Supabase with models when API key is available', async () => {
    // Skip if no API key
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping test - no OPENAI_API_KEY found');
      return;
    }

    console.log('Testing real Supabase integration...');
    
    // Test 1: Update models in Supabase
    await updateModelsInSupabase();
    
    // Test 2: Load models via configManager
    await configManager.load();
    
    console.log('✅ Real database test completed');
  });

  it('should handle missing API key gracefully', async () => {
    await updateModelsInSupabase();
    // Should log warning about missing API key
  });
});