#!/usr/bin/env node

import configManager from '../src/configmanager';
import gcsUtil from '../src/utils/gs';

async function testGCSFileSync() {
  console.log('Testing GCS file sync functionality...');
  
  // Test account ID - you may need to adjust this
  const testAccountId = 'test-account-123';
  
  try {
    // Test GCS utility directly
    console.log('Testing GCS utility...');
    
    // Test upload with sample data
    const testInstances = [
      {
        id: 'test-instance-1',
        name: 'Test Bot 1',
        bot_id: 'bot-123',
        role: 'developer',
        image: 'gemini-docker',
        cli: 'gemini',
        model: 'auto',
        preset: 'auto',
        enabled: true,
        managed_projects: ['project-1', 'project-2'],
        working_directory: 'bot-instances/test-instance-1'
      }
    ];

    const testProjects = [
      {
        id: 'project-1',
        name: 'Test Project 1',
        description: 'A test project',
        repository_url: 'https://github.com/test/project1',
        assigned_qa: 'qa-user',
        discord_channel_ids: ['channel-1', 'channel-2'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    // Test with a test bucket (you'll need to create this)
    const testBucket = 'zulu-bot-test-bucket';
    
    console.log('Uploading test instances.json...');
    await gcsUtil.uploadData(
      JSON.stringify(testInstances, null, 2),
      testBucket,
      'bot-instances/instances.json'
    );

    console.log('Uploading test projects.json...');
    await gcsUtil.uploadData(
      JSON.stringify(testProjects, null, 2),
      testBucket,
      'bot-instances/projects.json'
    );

    console.log('✅ Test files uploaded successfully');

    // Test download
    console.log('Testing download...');
    const downloadedInstances = await gcsUtil.downloadData(testBucket, 'bot-instances/instances.json');
    console.log('Downloaded instances:', JSON.parse(downloadedInstances));

    // Test config manager sync
    console.log('Testing config manager sync...');
    const account = await configManager.loadUpdateAccount(testAccountId);
    console.log(`Account loaded with ${account.instances.length} instances and ${account.projects.length} projects`);

  } catch (error) {
    console.error('Error testing GCS file sync:', error);
  }
}

testGCSFileSync();