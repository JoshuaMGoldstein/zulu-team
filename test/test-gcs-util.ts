#!/usr/bin/env node

import gcsUtil from '../src/utils/gs';

async function testGCSUtil() {
  console.log('Testing GCS utility methods...');

  let testBucketName: string | undefined;
  let serviceAccountEmail: string | undefined;

  try {
    // Test 1: Create a test bucket
    testBucketName = 'zulu-bot-test-' + Date.now();
    console.log(`Creating test bucket: ${testBucketName}`);
    await gcsUtil.createBucket(testBucketName);
    console.log('✅ Bucket created successfully');

    // Test 2: Upload test data
    const testData = JSON.stringify({ test: 'data', timestamp: new Date().toISOString() }, null, 2);
    console.log('Uploading test data...');
    await gcsUtil.uploadData(testData, testBucketName, 'test-data.json');
    console.log('✅ Data uploaded successfully');

    // Test 3: Download test data
    console.log('Downloading test data...');
    const downloadedData = await gcsUtil.downloadData(testBucketName, 'test-data.json');
    console.log('Downloaded data:', downloadedData);

    // Test 4: Check if object exists
    console.log('Checking if object exists...');
    const exists = await gcsUtil.objectExists(testBucketName, 'test-data.json');
    console.log(`Object exists: ${exists}`);

    // Test 5: List objects
    console.log('Listing objects...');
    const objects = await gcsUtil.listObjects(testBucketName);
    console.log('Objects in bucket:', objects);

    // Test 6: Create service account
    const testServiceAccountName = 'test-sa-' + Date.now();
    console.log(`Creating service account: ${testServiceAccountName}`);
    serviceAccountEmail = await gcsUtil.createServiceAccount(
      testServiceAccountName, 
      'Test service account for Zulu Bot'
    );
    console.log(`✅ Service account created: ${serviceAccountEmail}`);

    // Test 7: Create service account key
    console.log('Creating service account key...');
    const keyData = await gcsUtil.createServiceAccountKey(serviceAccountEmail);
    console.log('✅ Service account key created');

    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    // Cleanup
    console.log('Cleaning up test resources...');
    if (serviceAccountEmail) {
      await gcsUtil.deleteServiceAccount(serviceAccountEmail);
      console.log('✅ Service account deleted');
    }
    if (testBucketName) {
      await gcsUtil.deleteBucket(testBucketName);
      console.log('✅ Test bucket deleted');
    }
    console.log('✅ All tests finished.');
  }
}

testGCSUtil();