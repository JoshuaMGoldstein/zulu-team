#!/usr/bin/env node

import { WSDocker } from '../src/utils/wsdocker';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugWSDocker() {
  console.log('Starting WSDocker debug session...');
  
  const docker = new WSDocker();
  const containerName = 'debug-test-container';
  
  try {
    console.log('1. Creating container...');
    await docker.run(containerName, 'gemini-docker');
    console.log('✓ Container created');
    
    console.log('2. Executing simple command...');
    const result = await docker.exec(containerName, 'echo "hello world"');
    console.log('✓ Command executed:', result);
    
    console.log('3. Cleaning up...');
    await docker.rm(containerName);
    console.log('✓ Container removed');
    
  } catch (error) {
    console.error('Error:', error);
    
    // Try to clean up on error
    try {
      await docker.rm(containerName);
    } catch (cleanupError) {
      console.warn('Cleanup failed:', cleanupError);
    }
  }
}

// Run the debug script
if (require.main === module) {
  debugWSDocker().catch(console.error);
}